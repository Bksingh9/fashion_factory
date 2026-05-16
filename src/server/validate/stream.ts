/**
 * Streaming generation for a single section.
 *
 * Returns a Web `ReadableStream<Uint8Array>` of text chunks for direct
 * piping out of a Next route handler. The chunked text accumulates into
 * a buffer; on stream close, we attempt a final zod schema parse and
 * persist the section if it succeeds. Failed parses are logged but the
 * stream itself still terminated cleanly (the client already saw the
 * text and can let the user edit).
 *
 * In sandbox/CI, `VALIDATE_STREAM_STUB=1` short-circuits the real LLM
 * stream and emits a deterministic canned stream over ~20 chunks.
 *
 * No real Anthropic streaming SDK wiring yet — the router doesn't
 * expose streaming surface today (Phase 6 ops pass + Phase 3 chunk 5
 * will land that). For now, we generate the section synchronously via
 * `generateSection` and emit it as one chunk; the API contract (Web
 * ReadableStream + text/event-stream) is preserved so chunk 5's route
 * can swap in real streaming without changing call sites.
 */
import { supabaseService } from "@/server/db/service";
import { generateSection, type SectionContext } from "./pipeline";
import type { SectionKind } from "./schemas";

export function isStreamStubbed(): boolean {
  return process.env.VALIDATE_STREAM_STUB === "1";
}

async function loadCtx(specId: string): Promise<SectionContext> {
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
}

const STUB_CHUNKS = [
  "[stream-stub] ",
  "Section ",
  "preview ",
  "for ",
  "phase 3 ",
  "verify path. ",
  "Real Anthropic streaming ",
  "lands in chunk 5 + ",
  "ops pass Phase 6.",
];

export interface StreamSectionOptions {
  specId: string;
  userId: string;
  kind: SectionKind;
}

/**
 * Begin streaming a section to the client. Returns the Web ReadableStream;
 * caller wraps it in a Response with `text/event-stream` headers.
 */
export async function streamSection(opts: StreamSectionOptions): Promise<ReadableStream<Uint8Array>> {
  const ctx = await loadCtx(opts.specId);
  if (ctx.spec.user_id !== opts.userId) {
    throw new Error("not owner");
  }

  const encoder = new TextEncoder();

  if (isStreamStubbed()) {
    return new ReadableStream<Uint8Array>({
      async start(controller): Promise<void> {
        for (const chunk of STUB_CHUNKS) {
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          // 20-50ms per chunk to look realistic in dev.
          await new Promise<void>((resolve) => setTimeout(resolve, 30));
        }
        // Terminate the SSE stream with the conventional [DONE] sentinel.
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
  }

  // Non-stub: run the section to completion, then emit a single SSE
  // event with the JSON-serialized result. Real per-token streaming is
  // a Phase 6 ops pass task (Anthropic SDK gives us `messages.stream`).
  return new ReadableStream<Uint8Array>({
    async start(controller): Promise<void> {
      try {
        const result = await generateSection(ctx, opts.kind);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ section: opts.kind, parsed: result.parsed })}\n\n`),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });
}
