/**
 * Inngest client — single shared instance.
 *
 * The dev server picks this up via /api/inngest. Cron + queue jobs go
 * through Inngest functions (see ./functions/*); per invariants, no raw
 * Vercel Cron is used outside the public /healthz ping.
 */
import { Inngest } from "inngest";
import { env } from "@/env";
import type { CrawlSourceId } from "@/types/database";

export const inngest = new Inngest({
  id: "painpilot",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
});

export type AppEvents = {
  "noop.test": {
    data: { userId: string; throwOnce?: boolean };
  };
  "crawl.run.requested": {
    data: { source: CrawlSourceId };
  };
  "signal.ingested": {
    data: { signal_id: string };
  };
  "signal.embedded": {
    data: { signal_id: string };
  };
  "cluster.touched": {
    data: { cluster_id: string };
  };
  "validate.requested": {
    data: { spec_id: string; sections?: string[]; user_id?: string };
  };
  "validate.section.completed": {
    data: { spec_id: string; section: string };
  };
  "ship.requested": {
    data: {
      spec_id: string;
      installation_id: number;
      owner_login: string;
      repo_name?: string;
    };
  };
  "ship.completed": {
    data: { run_id: string; repo_url: string };
  };
  "ship.failed": {
    data: { run_id: string; error: string };
  };
  "github.app.event": {
    data: { event: string; payload: unknown };
  };
  "polar.event.received": {
    data: { event: { id: string; type: string; data: Record<string, unknown> } };
  };
  "product.publish.requested": {
    data: { product_id: string };
  };
  "marketplace.listing.updated": {
    data: { listing_id: string };
  };
};
