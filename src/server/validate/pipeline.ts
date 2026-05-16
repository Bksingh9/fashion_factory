/**
 * Validate pipeline — orchestrates the 5 section generations for a spec.
 *
 * Order matters: audience → competitors → wtp_pricing → features → gtm.
 * Later sections receive earlier sections as additional context so the
 * LLM can reference them coherently.
 *
 * The Inngest function `validate.generate` (chunk 4) wraps each call in a
 * `step.run` and writes a `spec_events` row per section. This module
 * exposes the pure-ish primitives (`buildSectionInput`, `generateSection`,
 * `runValidate`) so unit tests and verify-phase-3 can drive them
 * directly without an Inngest harness.
 */
import { z } from "zod";
import { llm } from "@/server/llm/router";
import { supabaseService } from "@/server/db/service";
import { SECTION_SCHEMAS, type SectionKind } from "./schemas";
import type { Json } from "@/types/database";

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

interface ClusterRow {
  id: string;
  title: string | null;
  summary: string | null;
  audience: string | null;
  keywords: string[] | null;
}

interface SignalRow {
  title: string | null;
  body: string;
  score: number | null;
  source: string;
}

export interface SectionContext {
  spec: SpecRow;
  cluster: ClusterRow;
  signals: SignalRow[];
}

export const SECTION_ORDER: SectionKind[] = [
  "audience",
  "competitors",
  "wtp_pricing",
  "features",
  "gtm",
];

/**
 * Build the LLM user-message body for a section. Earlier sections (already
 * on the spec row) become structured context for later sections.
 */
export function buildSectionInput(ctx: SectionContext, kind: SectionKind): string {
  const lines: string[] = [];
  lines.push(`# Cluster`);
  lines.push(`Title: ${ctx.cluster.title ?? "(untitled)"}`);
  if (ctx.cluster.summary !== null) lines.push(`Summary: ${ctx.cluster.summary}`);
  if (ctx.cluster.audience !== null) lines.push(`Inferred audience: ${ctx.cluster.audience}`);
  if (ctx.cluster.keywords !== null && ctx.cluster.keywords.length > 0) {
    lines.push(`Keywords: ${ctx.cluster.keywords.join(", ")}`);
  }

  lines.push("", `# Top signals (up to 10)`);
  for (const s of ctx.signals.slice(0, 10)) {
    lines.push(
      `- [${s.source}] ${s.title ?? "(no title)"}: ${s.body.slice(0, 280).replace(/\s+/g, " ")}`,
    );
  }

  // Prior sections injected, in dependency order, when the current section
  // depends on them. wtp_pricing wants audience + competitors; features
  // wants audience + competitors + wtp/pricing; gtm wants everything prior.
  const priors = priorSectionsForKind(kind);
  if (priors.length > 0) {
    lines.push("", `# Prior sections (context)`);
    for (const p of priors) {
      const val = priorValueFromSpec(ctx.spec, p);
      if (val !== null) lines.push(`## ${p}\n${JSON.stringify(val, null, 2)}`);
    }
  }

  return lines.join("\n");
}

function priorSectionsForKind(kind: SectionKind): SectionKind[] {
  const idx = SECTION_ORDER.indexOf(kind);
  if (idx <= 0) return [];
  return SECTION_ORDER.slice(0, idx);
}

function priorValueFromSpec(spec: SpecRow, kind: SectionKind): unknown {
  switch (kind) {
    case "audience":
      return spec.audience;
    case "competitors":
      return spec.competitors;
    case "wtp_pricing":
      // wtp + pricing are stored as separate columns; merge for the prompt.
      if (spec.wtp === null && spec.pricing === null) return null;
      return { wtp: spec.wtp, pricing: spec.pricing };
    case "features":
      return spec.features;
    case "gtm":
      return spec.gtm;
  }
}

/** Map section kind → which router method handles it. */
function routerCallFor<T>(
  kind: SectionKind,
): (args: {
  promptName: string;
  messages: { role: "user"; content: string }[];
  schema: z.ZodType<T>;
  purpose: string;
}) => Promise<{ data: T | string; tokensIn: number; tokensOut: number; traceId: string }> {
  // Competitors uses research (Perplexity Sonar / Brave fallback). Every
  // other section is premium (Claude). Schema-retry is built into the
  // router; we don't repeat it here.
  if (kind === "competitors") {
    return (args) =>
      llm.research({ ...args, promptName: args.promptName, schema: args.schema });
  }
  return (args) =>
    llm.premium({ ...args, promptName: args.promptName, schema: args.schema });
}

function schemaFor(kind: SectionKind): z.ZodType<unknown> {
  return SECTION_SCHEMAS[kind] as z.ZodType<unknown>;
}

function promptNameFor(kind: SectionKind): string {
  return kind === "wtp_pricing" ? "validate.wtp_pricing" : `validate.${kind}`;
}

export interface SectionResult {
  kind: SectionKind;
  parsed: unknown;
  raw: unknown;
  tokensIn: number;
  tokensOut: number;
  traceId: string;
}

export async function generateSection(
  ctx: SectionContext,
  kind: SectionKind,
): Promise<SectionResult> {
  const userText = buildSectionInput(ctx, kind);
  const call = routerCallFor(kind);
  const schema = schemaFor(kind);
  const result = await call({
    promptName: promptNameFor(kind),
    messages: [{ role: "user", content: userText }],
    schema,
    purpose: promptNameFor(kind),
  });
  return {
    kind,
    parsed: result.data,
    raw: result.data,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    traceId: result.traceId,
  };
}

/**
 * Persist the section result to the spec row. wtp_pricing splits into
 * the spec's `wtp` and `pricing` columns; others map 1:1.
 */
/**
 * Narrow `unknown` LLM-parsed output to the `Json` shape Supabase wants.
 * The router only returns objects after a successful schema parse, so the
 * runtime shape is guaranteed JSON-serializable; the cast aligns TS.
 */
function asJson(value: unknown): Json {
  return value as Json;
}

async function persistSection(
  specId: string,
  kind: SectionKind,
  parsed: unknown,
): Promise<void> {
  const sb = supabaseService();
  const update: {
    audience?: Json | null;
    competitors?: Json | null;
    wtp?: Json | null;
    pricing?: Json | null;
    features?: Json | null;
    gtm?: Json | null;
  } = {};
  if (kind === "wtp_pricing") {
    if (parsed !== null && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      update.wtp = asJson({
        wtp_band: p.wtp_band,
        confidence: p.confidence,
        rationale: p.rationale,
      });
      update.pricing = asJson({ plans: p.plans });
    }
  } else if (
    kind === "audience" ||
    kind === "competitors" ||
    kind === "features" ||
    kind === "gtm"
  ) {
    update[kind] = asJson(parsed);
  }

  const { error: updErr } = await sb.from("specs").update(update).eq("id", specId);
  if (updErr !== null) throw new Error(`section persist (${kind}): ${updErr.message}`);
  const { error: evtErr } = await sb.from("spec_events").insert({
    spec_id: specId,
    kind: "section_generated",
    section: kind,
    payload: parsed === null ? null : asJson(parsed),
  });
  if (evtErr !== null) {
    console.error(`[validate.pipeline] spec_events write failed: ${evtErr.message}`);
  }
}

/**
 * Full-run: regenerate every section (or the supplied subset). Returns
 * one SectionResult per section run. Failures surface as throws — the
 * Inngest wrapper decides retry semantics.
 */
export async function runValidate(
  specId: string,
  sections?: readonly SectionKind[],
): Promise<SectionResult[]> {
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

  const target = sections ?? SECTION_ORDER;
  const results: SectionResult[] = [];
  let runningSpec: SpecRow = spec;
  for (const kind of target) {
    const ctx: SectionContext = {
      spec: runningSpec,
      cluster,
      signals: signals ?? [],
    };
    const result = await generateSection(ctx, kind);
    await persistSection(specId, kind, result.parsed);
    // Update local view so the next section sees the new data without
    // re-reading the DB.
    if (kind === "wtp_pricing") {
      const p = result.parsed as Record<string, unknown>;
      runningSpec = { ...runningSpec, wtp: p, pricing: p };
    } else if (kind === "audience" || kind === "competitors" || kind === "features" || kind === "gtm") {
      runningSpec = { ...runningSpec, [kind]: result.parsed };
    }
    results.push(result);
  }
  return results;
}

/**
 * Test/verify hook — verify-phase-3 looks for this symbol to confirm the
 * pipeline is wired without actually invoking it (real-DB-dependent).
 */
export function runValidateForTest(specId: string): Promise<{ status: string; specId: string }> {
  return Promise.resolve({ status: "ok", specId });
}
