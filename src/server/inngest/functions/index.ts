/**
 * Barrel of all Inngest functions registered with serve().
 * Add new functions here and they'll be picked up by /api/inngest.
 */
import { noopFn } from "./noop";
import { crawlScheduler } from "./crawl.scheduler";
import { crawlRun } from "./crawl.run";
import { signalEmbed } from "./signal.embed";
import { signalCluster } from "./signal.cluster";
import { clusterSummarize } from "./cluster.summarize";

export const functions = [
  noopFn,
  crawlScheduler, // cron */10 * * * * — fans out crawl.run.requested events
  crawlRun, // event crawl.run.requested
  signalEmbed, // event signal.ingested
  signalCluster, // event signal.embedded
  clusterSummarize, // event cluster.touched (5m debounce)
];
