/**
 * Inngest serve endpoint. The Inngest dev server / cloud pings here to
 * register functions and dispatch invocations.
 */
import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { functions } from "@/server/inngest/functions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// `signingKey` is configured on the Inngest client in v4; the serve handler
// reads it from there.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
