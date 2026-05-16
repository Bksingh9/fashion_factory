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
import { privacyPurgeAuthors } from "./privacy.purge_authors";
import { validateGenerate, validateCompetitorRefresh } from "./validate.generate";

export const functions = [
  noopFn,
  crawlScheduler, // cron every 10 min — fans out crawl.run.requested events
  crawlRun, // event crawl.run.requested
  signalEmbed, // event signal.ingested
  signalCluster, // event signal.embedded
  clusterSummarize, // event cluster.touched (5m debounce)
  privacyPurgeAuthors, // cron 0 3 * * * — §9 90-day author purge
  validateGenerate, // event validate.requested
  validateCompetitorRefresh, // cron 0 4 * * * — weekly competitors refresh on draft specs
];
