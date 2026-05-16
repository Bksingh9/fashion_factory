/**
 * crawl.scheduler — cron "every 10 minutes" (see triggers below).
 *
 * Reads `crawl_sources where enabled = true` and fans out one
 * `crawl.run.requested` event per source. Decoupling the schedule
 * from per-source execution means a single source's rate-limit /
 * 5xx failure doesn't cascade into other sources.
 */
import { inngest } from "../client";
import { supabaseService } from "@/server/db/service";

export const crawlScheduler = inngest.createFunction(
  {
    id: "crawl.scheduler",
    triggers: [{ cron: "*/10 * * * *" }],
  },
  async ({ step }) => {
    const enabled = await step.run("list-enabled-sources", async () => {
      const sb = supabaseService();
      const { data, error } = await sb
        .from("crawl_sources")
        .select("id")
        .eq("enabled", true);
      if (error !== null) throw new Error(`crawl_sources: ${error.message}`);
      return (data ?? []).map((r) => r.id);
    });

    if (enabled.length === 0) {
      return { dispatched: 0, sources: [] };
    }

    await step.sendEvent(
      "dispatch-per-source",
      enabled.map((source) => ({
        name: "crawl.run.requested" as const,
        data: { source },
      })),
    );

    return { dispatched: enabled.length, sources: enabled };
  },
);
