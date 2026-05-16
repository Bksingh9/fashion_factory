/**
 * Promptfoo eval runner.
 *
 * Phase 6 wires the structure (suite YAMLs under /src/server/eval/suites,
 * runEvalSuite() reads each suite + writes an `eval_runs` row, eval.run.
 * nightly cron walks every active prompt). Real promptfoo execution is
 * gated behind OBSERVABILITY_STUB=1 vs the real `promptfoo` CLI; in stub
 * mode we return a synthetic pass row so verify can run in sandbox.
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { supabaseService } from "@/server/db/service";

export function isEvalStubbed(): boolean {
  return process.env.OBSERVABILITY_STUB === "1";
}

export interface EvalResult {
  prompt_name: string;
  prompt_version: string;
  suite: string;
  passed: number;
  failed: number;
  total: number;
  score: number;
}

export function listSuites(): string[] {
  const dir = path.join(process.cwd(), "src/server/eval/suites");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
}

export async function runEvalSuite(promptName: string, version: string): Promise<EvalResult> {
  if (isEvalStubbed()) {
    console.warn(`[OBS-STUB] promptfoo would run ${promptName}@${version}`);
    return {
      prompt_name: promptName,
      prompt_version: version,
      suite: "stub",
      passed: 1,
      failed: 0,
      total: 1,
      score: 1.0,
    };
  }
  // Real path: spawn `promptfoo eval` with the suite path + assertions.
  // Implementation pending Phase 6.5 (needs CI shape decisions).
  throw new Error("promptfoo: real runner not yet implemented; set OBSERVABILITY_STUB=1");
}

export async function persistEvalResult(result: EvalResult): Promise<void> {
  if (isEvalStubbed()) {
    console.warn(`[OBS-STUB] eval result persist (skipped in stub): ${JSON.stringify(result)}`);
    return;
  }
  const sb = supabaseService();
  const { error } = await sb.from("eval_runs").insert({
    prompt_name: result.prompt_name,
    prompt_version: result.prompt_version,
    suite: result.suite,
    passed: result.passed,
    failed: result.failed,
    total: result.total,
    score: result.score,
    finished_at: new Date().toISOString(),
  });
  if (error !== null) console.error(`[eval] persist failed: ${error.message}`);
}
