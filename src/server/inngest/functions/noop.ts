/**
 * Sample Inngest function used by verify-phase-1 to prove the durable-step
 * pipeline works end-to-end.
 *
 * - Triggers on `noop.test` events.
 * - `step.run("sleep", ...)` durably records 1s of inactivity.
 * - If the event data has `throwOnce: true`, the function throws on the
 *   first attempt and succeeds on the retry. This validates the retry path.
 */
import { inngest } from "../client";
import { log } from "@/lib/log";

export const noopFn = inngest.createFunction(
  {
    id: "noop.fn",
    retries: 2,
    triggers: [{ event: "noop.test" }],
  },
  async ({ event, step, attempt }) => {
    await step.run("sleep", async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      return { slept: 1000 };
    });

    await step.run("log", async () => {
      log.info("noop.fn ran", {
        userId: event.data.userId,
        attempt,
      });
      return { logged: true };
    });

    if (event.data.throwOnce === true && attempt === 0) {
      // Force a single retry path so callers can prove retries work.
      throw new Error("noop.fn: throwOnce — first attempt fails on purpose");
    }

    return { ok: true, userId: event.data.userId, attempts: attempt + 1 };
  },
);
