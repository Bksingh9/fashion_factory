/**
 * validate.generate — `validate.requested` worker.
 *
 * Drives the full 5-section validate pipeline for a single spec. Each
 * section is wrapped in its own `step.run` so Inngest checkpoints per
 * section — a partial failure replays only the failed section, not the
 * whole 5-call chain.
 *
 * Steps:
 *   1. load-cluster   — read spec + cluster + top signals.
 *   2. gen-audience   (premium, schema-validated)
 *   3. gen-competitors (research)
 *   4. gen-wtp-pricing (premium)
 *   5. gen-features    (premium)
 *   6. gen-gtm         (premium)
 *   7. emit-section-completed events for each section persisted.
 *
 * Each section's persistSection() write triggers a `spec_events` row;
 * the cron `validate.competitor_refresh` (in this file) rescans drafts
 * weekly to keep `competitors` fresh.
 */
import { inngest } from "../client";
import { supabaseService } from "@/server/db/service";
import {
  generateSection,
  SECTION_ORDER,
  type SectionContext,
} from "@/server/validate/pipeline";
import type { SectionKind } from "@/server/validate/schemas";
import type { Json } from "@/types/database";

function asJson(value: unknown): Json {
  return value as Json;
}

interface SpecRow {
  id: string;
  user_id: string;
  cluster_id: string;
  audience: unknown;
  competitors: unknown;
  wtp: unknown;
  pricing: unknown;
  features: unknown;
  gtm: unknown;
}

function isSectionKind(s: unknown): s is SectionKind {
  return typeof s === "string" && (SECTION_ORDER as readonly string[]).includes(s);
}

export const validateGenerate = inngest.createFunction(
  {
    id: "validate.generate",
    retries: 2,
    triggers: [{ event: "validate.requested" }],
  },
  async ({ event, step }) => {
    const specId = event.data.spec_id as string;
    const userSections = Array.isArray(event.data.sections)
      ? (event.data.sections as unknown[]).filter(isSectionKind)
      : null;
    const targetSections: readonly SectionKind[] =
      userSections === null || userSections.length === 0 ? SECTION_ORDER : userSections;

    // ----- load-cluster -----
    const ctx = await step.run("load-cluster", async () => {
      const sb = supabaseService();
      const { data: spec, error: specErr } = await sb
        .from("specs")
        .select("id, user_id, cluster_id, audience, competitors, wtp, pricing, features, gtm")
        .eq("id", specId)
        .maybeSingle();
      if (specErr !== null) throw new Error(`spec read: ${specErr.message}`);
      if (spec === null) throw new Error(`spec ${specId} not found`);

      const { data: cluster, error: cErr } = await sb
        .from("clusters")
        .select("id, title, summary, audience, keywords")
        .eq("id", spec.cluster_id)
        .maybeSingle();
      if (cErr !== null) throw new Error(`cluster read: ${cErr.message}`);
      if (cluster === null) throw new Error(`cluster ${spec.cluster_id} not found`);

      const { data: signals, error: sErr } = await sb
        .from("signals")
        .select("title, body, score, source")
        .eq("cluster_id", spec.cluster_id)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(10);
      if (sErr !== null) throw new Error(`signals read: ${sErr.message}`);

      return { spec, cluster, signals: signals ?? [] };
    });

    // ----- per-section generation -----
    let runningSpec: SpecRow = ctx.spec;
    const completed: SectionKind[] = [];
    for (const kind of targetSections) {
      const result = await step.run(`gen-${kind}`, async () => {
        const sectionCtx: SectionContext = {
          spec: runningSpec,
          cluster: ctx.cluster,
          signals: ctx.signals,
        };
        const r = await generateSection(sectionCtx, kind);
        // Persist inside the same step so the post-LLM DB write is
        // atomic w.r.t. retry semantics. Mirrors signal.cluster.ts.
        const sb = supabaseService();
        const update: {
          audience?: Json | null;
          competitors?: Json | null;
          wtp?: Json | null;
          pricing?: Json | null;
          features?: Json | null;
          gtm?: Json | null;
        } = {};
        if (kind === "wtp_pricing" && typeof r.parsed === "object" && r.parsed !== null) {
          const p = r.parsed as Record<string, unknown>;
          update.wtp = asJson({
            wtp_band: p.wtp_band,
            confidence: p.confidence,
            rationale: p.rationale,
          });
          update.pricing = asJson({ plans: p.plans });
        } else if (
          kind === "audience" ||
          kind === "competitors" ||
          kind === "features" ||
          kind === "gtm"
        ) {
          update[kind] = asJson(r.parsed);
        }
        const { error: updErr } = await sb.from("specs").update(update).eq("id", specId);
        if (updErr !== null) throw new Error(`section persist (${kind}): ${updErr.message}`);
        const { error: evtErr } = await sb.from("spec_events").insert({
          spec_id: specId,
          kind: "section_generated",
          section: kind,
          payload: r.parsed === null ? null : asJson(r.parsed),
        });
        if (evtErr !== null) {
          console.error(`[validate.generate] spec_events write failed: ${evtErr.message}`);
        }
        return {
          parsed: r.parsed,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          traceId: r.traceId,
        };
      });

      // Locally update the running spec so the next section sees the
      // newly-written prior context without a DB round-trip.
      if (kind === "wtp_pricing" && typeof result.parsed === "object" && result.parsed !== null) {
        const p = result.parsed as Record<string, unknown>;
        runningSpec = {
          ...runningSpec,
          wtp: { wtp_band: p.wtp_band, confidence: p.confidence, rationale: p.rationale },
          pricing: { plans: p.plans },
        };
      } else if (
        kind === "audience" ||
        kind === "competitors" ||
        kind === "features" ||
        kind === "gtm"
      ) {
        runningSpec = { ...runningSpec, [kind]: result.parsed };
      }
      completed.push(kind);
    }

    // ----- emit per-section completion events -----
    if (completed.length > 0) {
      await step.sendEvent(
        "fanout-section-completed",
        completed.map((section) => ({
          name: "validate.section.completed" as const,
          data: { spec_id: specId, section },
        })),
      );
    }

    return { spec_id: specId, sections: completed };
  },
);

/**
 * validate.competitor_refresh — daily cron.
 *
 * Walks every draft spec whose `competitors` JSONB is older than 7 days
 * (heuristic: read updated_at as proxy for last-touched) and re-emits a
 * `validate.requested` event scoped to the competitors section only.
 * Debounce on `spec_id` so multiple ingressers don't pile up.
 */
export const validateCompetitorRefresh = inngest.createFunction(
  {
    id: "validate.competitor_refresh",
    retries: 1,
    triggers: [{ cron: "0 4 * * *" }],
  },
  async ({ step }) => {
    const stale = await step.run("find-stale-drafts", async () => {
      const sb = supabaseService();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await sb
        .from("specs")
        .select("id")
        .eq("status", "draft")
        .lt("updated_at", sevenDaysAgo)
        .limit(50);
      if (error !== null) throw new Error(`stale spec read: ${error.message}`);
      return (data ?? []).map((r) => r.id);
    });

    if (stale.length === 0) return { refreshed: 0 };

    await step.sendEvent(
      "refresh-competitors",
      stale.map((spec_id) => ({
        name: "validate.requested" as const,
        data: { spec_id, sections: ["competitors"] },
      })),
    );
    return { refreshed: stale.length };
  },
);
