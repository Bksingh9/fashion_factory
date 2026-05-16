/**
 * Inngest client — single shared instance.
 *
 * The dev server picks this up via /api/inngest. Cron + queue jobs go
 * through Inngest functions (see ./functions/*); per invariants, no raw
 * Vercel Cron is used outside the public /healthz ping.
 */
import { Inngest } from "inngest";
import { env } from "@/env";

export const inngest = new Inngest({
  id: "painpilot",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
});

export type AppEvents = {
  "noop.test": {
    data: { userId: string; throwOnce?: boolean };
  };
};
