/**
 * Langfuse trace wrapper — STUBBED per Phase 1 ops decision.
 *
 * Returns a synthetic trace_id (so downstream code & DB schema remain
 * correct) and logs every call. Real Langfuse wiring lands in the Phase 1.5
 * ops pass: swap this module for one that calls the SDK.
 *
 * Interface preserved exactly so the swap is a one-file change.
 */
import { randomUUID } from "node:crypto";

export interface TraceContext {
  name: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceHandle {
  traceId: string;
  end: (output: { tokensIn?: number; tokensOut?: number; error?: string }) => void;
}

export function startTrace(ctx: TraceContext): TraceHandle {
  const traceId = `stub-${randomUUID()}`;
  console.warn(
    `[OBS-STUB] Langfuse would START trace ${JSON.stringify({
      traceId,
      name: ctx.name,
      userId: ctx.userId ?? null,
    })}. Wire real SDK in Phase 1.5.`,
  );
  return {
    traceId,
    end: (output): void => {
      console.warn(
        `[OBS-STUB] Langfuse would END trace ${JSON.stringify({
          traceId,
          ...output,
        })}.`,
      );
    },
  };
}
