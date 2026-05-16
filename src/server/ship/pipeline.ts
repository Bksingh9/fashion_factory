/**
 * Ship pipeline — orchestrates the locked-spec → repo flow.
 *
 * Phase 4 design: this module exposes pure-ish primitives that the
 * Inngest `ship.run` worker (chunk 3) wraps in `step.run` /
 * `step.parallel` blocks.
 *
 *   1. scaffoldRepo  — call createRepoFromTemplate; record repo coords.
 *   2. generatePlan  — llm.premium with `ship.plan` prompt.
 *   3. generateFiles — for each plan file, llm.premium with the right
 *                      per-kind prompt; collect contents.
 *   4. commitAll     — single Git tree commit of every generated file,
 *                      plus README + smoke test.
 *
 * The Inngest function parallelizes step 3 via step.parallel so the
 * 20s ship→repo budget is hittable.
 */
import { llm } from "@/server/llm/router";
import { commitTree, createRepoFromTemplate } from "@/server/github/repos";
import {
  shipCommitMessageSchema,
  shipFileContentsSchema,
  shipPlanSchema,
  shipReadmeSchema,
  type ShipPlan,
  type ShipPlanFile,
} from "./plan";
import { loadTemplate, type ShipTemplate } from "./templates";

export interface LockedSpec {
  id: string;
  cluster_id: string;
  audience: unknown;
  competitors: unknown;
  wtp: unknown;
  pricing: unknown;
  features: unknown;
  gtm: unknown;
}

function specContext(spec: LockedSpec): string {
  return [
    `# Audience\n${JSON.stringify(spec.audience, null, 2)}`,
    `# Competitors\n${JSON.stringify(spec.competitors, null, 2)}`,
    `# WTP + Pricing\n${JSON.stringify({ wtp: spec.wtp, pricing: spec.pricing }, null, 2)}`,
    `# Features\n${JSON.stringify(spec.features, null, 2)}`,
    `# GTM\n${JSON.stringify(spec.gtm, null, 2)}`,
  ].join("\n\n");
}

export interface ScaffoldedRepo {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  template: ShipTemplate;
}

export async function scaffoldRepo(args: {
  installationId: number;
  ownerLogin: string;
  templateId: string;
  repoName: string;
}): Promise<ScaffoldedRepo> {
  const template = await loadTemplate(args.templateId);
  const created = await createRepoFromTemplate({
    installationId: args.installationId,
    templateOwner: template.owner,
    templateRepo: template.repo,
    ownerLogin: args.ownerLogin,
    name: args.repoName,
    isPrivate: true,
  });
  return {
    owner: created.owner,
    name: created.name,
    url: created.url,
    defaultBranch: created.default_branch,
    template,
  };
}

export async function generatePlan(spec: LockedSpec): Promise<ShipPlan> {
  const result = await llm.premium({
    purpose: "ship.plan",
    promptName: "ship.plan",
    schema: shipPlanSchema,
    messages: [{ role: "user", content: specContext(spec) }],
  });
  if (typeof result.data !== "object" || result.data === null) {
    throw new Error("ship.plan: LLM returned unparseable plan");
  }
  return result.data;
}

export interface GeneratedFile {
  path: string;
  contents: string;
  generatedBy: string;
}

export async function generateFileFromPlan(
  spec: LockedSpec,
  plan: ShipPlanFile,
): Promise<GeneratedFile> {
  const promptName =
    plan.kind === "route"
      ? "ship.route.generate"
      : plan.kind === "component"
        ? "ship.component.generate"
        : "ship.route.generate"; // lib/config/test fall back to route gen prompt
  const input = `${specContext(spec)}\n\n# File\n${JSON.stringify(plan, null, 2)}`;
  const result = await llm.premium({
    purpose: promptName,
    promptName,
    schema: shipFileContentsSchema,
    messages: [{ role: "user", content: input }],
  });
  if (typeof result.data !== "object" || result.data === null) {
    throw new Error(`${promptName}: LLM returned unparseable file`);
  }
  return { ...result.data, generatedBy: promptName };
}

export async function generateReadme(spec: LockedSpec, plan: ShipPlan): Promise<GeneratedFile> {
  const input = `${specContext(spec)}\n\n# Planned files\n${JSON.stringify(plan, null, 2)}`;
  const result = await llm.hot({
    purpose: "ship.readme.generate",
    promptName: "ship.readme.generate",
    schema: shipReadmeSchema,
    messages: [{ role: "user", content: input }],
  });
  if (typeof result.data !== "object" || result.data === null) {
    throw new Error("ship.readme.generate: unparseable");
  }
  return { path: "README.md", contents: result.data.contents, generatedBy: "ship.readme.generate" };
}

export async function generateCommitMessage(
  spec: LockedSpec,
  plan: ShipPlan,
): Promise<{ title: string; body: string }> {
  const input = `${specContext(spec)}\n\n# File list\n${plan.files.map((f) => f.path).join("\n")}`;
  const result = await llm.hot({
    purpose: "ship.commit_message",
    promptName: "ship.commit_message",
    schema: shipCommitMessageSchema,
    messages: [{ role: "user", content: input }],
  });
  if (typeof result.data !== "object" || result.data === null) {
    return { title: "feat: initial ship via PainPilot", body: "Generated MVP scaffold." };
  }
  return result.data;
}

export async function commitGeneratedFiles(args: {
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  files: GeneratedFile[];
  title: string;
  body: string;
}): Promise<{ commitSha: string }> {
  const { commitSha } = await commitTree({
    installationId: args.installationId,
    owner: args.owner,
    repo: args.repo,
    branch: args.branch,
    baseCommitSha: null,
    files: args.files.map((f) => ({ path: f.path, contents: f.contents })),
    message: `${args.title}\n\n${args.body}`,
  });
  return { commitSha };
}
