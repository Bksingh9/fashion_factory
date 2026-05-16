/**
 * polar.event.ingest — `polar.event.received` worker.
 *
 * The webhook route does HMAC verification + idempotency-mark and
 * dispatches into Inngest with the parsed event. This function persists
 * the audit row + drives the per-event handler.
 */
import { inngest } from "../client";
import { handlePolarEvent, type PolarEvent } from "@/server/payments/polar";

export const polarEventIngest = inngest.createFunction(
  {
    id: "polar.event.ingest",
    retries: 2,
    triggers: [{ event: "polar.event.received" }],
  },
  async ({ event, step }) => {
    return step.run("apply", () => {
      const evt = event.data.event as PolarEvent;
      return handlePolarEvent(evt);
    });
  },
);
