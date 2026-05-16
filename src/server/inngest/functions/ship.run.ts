/**
 * ship.run — `ship.requested` worker.
 *
 * Pipeline:
 *   1. load-spec       — read the locked spec; throw if status != 'locked'.
 *   2. create-run      — insert ship_runs (status='queued') and capture id.
 *   3. scaffold        — call scaffoldRepo; update status='scaffolding'.
 *   4. generate-plan   — llm.premium(ship.plan) → shipPlanSchema parse.
 *   5. generate-files  — step.parallel over plan files (capped per budget).
 *   6. generate-readme + generate-commit-msg.
 *   7. commit-tree     — single Git tree commit.
 *   8. record-files    — insert ship_files rows.
 *   9. mark-done       — ship_runs.status='done'; emit ship.completed.
 *
 * Failure mode: any thrown error transitions status to 'failed' and emits
 * ship.failed with the error message; Inngest retries the function once.
 */
import { inngest } from "../client";
import { supabaseService } from "@/server/db/service";
import {
  commitGeneratedFiles,
  generateCommitMessage,
  generateFileFromPlan,
  generatePlan,
  generateReadme,
  scaffoldRepo,
  type LockedSpec,
} from "@/server/ship/pipeline";
import { DEFAULT_TEMPLATE_ID } from "@/server/ship/templates";

async function markFailed(runId: string, message: string): Promise<void> {
  const sb = supabaseService();
  await sb
    .from("ship_runs")
    .update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export const shipRun = inngest.createFunction(
  {
    id: "ship.run",
    retries: 1,
    triggers: [{ event: "ship.requested" }],
  },
  async ({ event, step }) => {
    const specId = event.data.spec_id as string;
    const installationId = event.data.installation_id as number;
    const ownerLogin = event.data.owner_login as string;
    const repoName = (event.data.repo_name as string | undefined) ?? `painpilot-${specId.slice(0, 8)}`;

    // 1. load-spec
    const spec = await step.run("load-spec", async () => {
      const sb = supabaseService();
      const { data, error } = await sb
        .from("specs")
        .select("id, user_id, cluster_id, status, audience, competitors, wtp, pricing, features, gtm")
        .eq("id", specId)
        .maybeSingle();
      if (error !== null) throw new Error(`spec read: ${error.message}`);
      if (data === null) throw new Error(`spec ${specId} not found`);
      if (data.status !== "locked") throw new Error(`spec ${specId} is not locked`);
      return data;
    });

    // 2. create-run
    const runId = await step.run("create-run", async () => {
      const sb = supabaseService();
      const { data, error } = await sb
        .from("ship_runs")
        .insert({
          user_id: spec.user_id,
          spec_id: specId,
          template_id: DEFAULT_TEMPLATE_ID,
          status: "queued",
          installation_id: installationId,
        })
        .select("id")
        .single();
      if (error !== null) throw new Error(`ship_runs insert: ${error.message}`);
      return data.id;
    });

    try {
      // 3. scaffold
      const scaffolded = await step.run("scaffold", async () => {
        const sb = supabaseService();
        await sb.from("ship_runs").update({ status: "scaffolding" }).eq("id", runId);
        const r = await scaffoldRepo({
          installationId,
          ownerLogin,
          templateId: DEFAULT_TEMPLATE_ID,
          repoName,
        });
        await sb
          .from("ship_runs")
          .update({
            repo_owner: r.owner,
            repo_name: r.name,
            repo_url: r.url,
            default_branch: r.defaultBranch,
          })
          .eq("id", runId);
        return r;
      });

      // 4. generate-plan
      const plan = await step.run("generate-plan", async () => {
        const sb = supabaseService();
        await sb.from("ship_runs").update({ status: "generating" }).eq("id", runId);
        const lockedSpec: LockedSpec = {
          id: spec.id,
          cluster_id: spec.cluster_id,
          audience: spec.audience,
          competitors: spec.competitors,
          wtp: spec.wtp,
          pricing: spec.pricing,
          features: spec.features,
          gtm: spec.gtm,
        };
        return generatePlan(lockedSpec);
      });

      // 5. generate-files (sequential under stub; Inngest's step.parallel
      // could fan out in production for the 20s budget).
      const lockedSpec: LockedSpec = {
        id: spec.id,
        cluster_id: spec.cluster_id,
        audience: spec.audience,
        competitors: spec.competitors,
        wtp: spec.wtp,
        pricing: spec.pricing,
        features: spec.features,
        gtm: spec.gtm,
      };
      const generatedFiles = await step.run("generate-files", async () => {
        const out: { path: string; contents: string; generatedBy: string }[] = [];
        for (const planFile of plan.files) {
          const r = await generateFileFromPlan(lockedSpec, planFile);
          out.push(r);
        }
        return out;
      });

      // 6. README + commit message
      const readme = await step.run("generate-readme", () => generateReadme(lockedSpec, plan));
      const msg = await step.run("generate-commit-message", () => generateCommitMessage(lockedSpec, plan));

      // 7. commit-tree
      const commitResult = await step.run("commit-tree", async () => {
        const sb = supabaseService();
        await sb.from("ship_runs").update({ status: "pushing" }).eq("id", runId);
        const allFiles = [...generatedFiles, readme];
        return commitGeneratedFiles({
          installationId,
          owner: scaffolded.owner,
          repo: scaffolded.name,
          branch: scaffolded.defaultBranch,
          files: allFiles,
          title: msg.title,
          body: msg.body,
        });
      });

      // 8. record-files
      await step.run("record-files", async () => {
        const sb = supabaseService();
        const rows = [...generatedFiles, readme].map((f) => ({
          run_id: runId,
          path: f.path,
          sha: commitResult.commitSha.slice(0, 40),
          bytes: f.contents.length,
          generated_by: f.generatedBy,
        }));
        if (rows.length === 0) return;
        const { error } = await sb.from("ship_files").insert(rows);
        if (error !== null) {
          console.error(`[ship.run] ship_files insert failed: ${error.message}`);
        }
      });

      // 9. mark-done + emit
      await step.run("mark-done", async () => {
        const sb = supabaseService();
        await sb
          .from("ship_runs")
          .update({
            status: "done",
            finished_at: new Date().toISOString(),
            metrics: { files: generatedFiles.length + 1, commit: commitResult.commitSha },
          })
          .eq("id", runId);
      });

      await step.sendEvent("emit-completed", {
        name: "ship.completed",
        data: { run_id: runId, repo_url: scaffolded.url },
      });

      return { run_id: runId, repo_url: scaffolded.url };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailed(runId, msg);
      await step.sendEvent("emit-failed", {
        name: "ship.failed",
        data: { run_id: runId, error: msg },
      });
      throw e;
    }
  },
);
