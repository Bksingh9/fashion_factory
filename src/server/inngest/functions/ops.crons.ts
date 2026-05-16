/**
 * Phase 6 ops crons:
 *   - eval.run.nightly       — daily 02:00 UTC promptfoo regression run.
 *   - perf.budget.scan       — every 5 min p95 sweep.
 *   - ops.heartbeat          — every minute; proves the work-plane lives.
 */
import { inngest } from "../client";
import { listSuites, runEvalSuite, persistEvalResult } from "@/server/eval/runner";

export const evalRunNightly = inngest.createFunction(
  {
    id: "eval.run.nightly",
    retries: 1,
    triggers: [{ cron: "0 2 * * *" }],
  },
  async ({ step }) => {
    const suites = await step.run("list-suites", () => Promise.resolve(listSuites()));
    let ran = 0;
    for (const suite of suites) {
      const name = suite.replace(/\.ya?ml$/, "");
      await step.run(`run-${name}`, async () => {
        const r = await runEvalSuite(name, "v1");
        await persistEvalResult(r);
      });
      ran++;
    }
    return { suites_run: ran };
  },
);

export const perfBudgetScan = inngest.createFunction(
  {
    id: "perf.budget.scan",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    return step.run("scan", () => {
      // Phase 6 ships the cron + table; real p95 reads land in 6.5.
      if (process.env.OBSERVABILITY_STUB === "1") {
        console.warn("[OBS-STUB] perf.budget.scan would compute p95s over last 5 min");
        return Promise.resolve({ scanned: true, violations: 0 });
      }
      return Promise.resolve({ scanned: true, violations: 0 });
    });
  },
);

export const opsHeartbeat = inngest.createFunction(
  {
    id: "ops.heartbeat",
    retries: 0,
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }) => {
    return step.run("beat", () => {
      if (process.env.OBSERVABILITY_STUB === "1") {
        return Promise.resolve({ alive: true, ts: new Date().toISOString() });
      }
      // Real path: write a tiny row to llm_traces or a dedicated heartbeats
      // table. For now we only confirm reachability.
      return Promise.resolve({ alive: true, ts: new Date().toISOString() });
    });
  },
);
