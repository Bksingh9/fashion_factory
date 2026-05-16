/**
 * CI guard: enforce invariant §9 "Never auto-post to Reddit, X, LinkedIn,
 * Instagram, Threads, or any social network."
 *
 * Walks every .ts / .tsx file with ts-morph. Precise rules — proximity
 * matters; a `reddit.com` URL on a GET line in one file plus a POST to an
 * unrelated URL elsewhere in the same file is NOT a violation.
 *
 *   1. `fetch(<url-literal>, { ..., method: 'POST', ... })`: the url literal
 *      must NOT contain a social-network domain.
 *   2. `axios.post(<url-literal>, ...)`: the url literal must NOT contain a
 *      social-network domain. (Same for axios.put / axios.patch / axios.delete.)
 *   3. Any file under /src/server/sources/ may not have `method: 'POST'`
 *      anywhere; crawlers are strictly read-only.
 */
import path from "node:path";
import { Project, SyntaxKind, type CallExpression } from "ts-morph";
import { describe, it } from "vitest";

const SOCIAL_RE = /reddit\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|threads\.net/i;
const POST_RE = /method\s*:\s*['"`]POST['"`]/;
const WRITE_AXIOS_METHODS = new Set(["post", "put", "patch", "delete"]);

function makeProject(): Project {
  return new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: false,
  });
}

function urlHasSocial(call: CallExpression): boolean {
  const first = call.getArguments()[0];
  if (first === undefined) return false;
  // Look at every string literal inside the first arg (covers template strings).
  for (const lit of [
    ...first.getDescendantsOfKind(SyntaxKind.StringLiteral),
    ...first.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
    ...first.getDescendantsOfKind(SyntaxKind.TemplateExpression),
  ]) {
    if (SOCIAL_RE.test(lit.getText())) return true;
  }
  return false;
}

describe("no auto-post to social networks", () => {
  it("no fetch(<social-url>, { method:'POST' }) anywhere", () => {
    const project = makeProject();
    const offenders: string[] = [];

    for (const file of project.getSourceFiles()) {
      const fp = file.getFilePath();
      if (fp.includes("/node_modules/") || fp.includes("/.next/")) continue;
      if (fp.endsWith("/tests/unit/no_auto_post.test.ts")) continue;

      for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        if (call.getExpression().getText() !== "fetch") continue;
        if (!urlHasSocial(call)) continue;
        const opts = call.getArguments()[1];
        if (opts === undefined) continue;
        if (POST_RE.test(opts.getText())) {
          offenders.push(`${fp}:${String(call.getStartLineNumber())}`);
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Social-network POST via fetch detected:\n  ${offenders.join("\n  ")}\n` +
          "Per invariant §9, PainPilot must NEVER auto-post.",
      );
    }
  });

  it("no axios.{post,put,patch,delete}(<social-url>, ...) anywhere", () => {
    const project = makeProject();
    const offenders: string[] = [];

    for (const file of project.getSourceFiles()) {
      const fp = file.getFilePath();
      if (fp.includes("/node_modules/") || fp.includes("/.next/")) continue;
      if (fp.endsWith("/tests/unit/no_auto_post.test.ts")) continue;

      for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const callee = call.getExpression();
        if (callee.getKind() !== SyntaxKind.PropertyAccessExpression) continue;
        const prop = callee.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const obj = prop.getExpression().getText();
        const method = prop.getName();
        if (obj !== "axios" || !WRITE_AXIOS_METHODS.has(method)) continue;
        if (urlHasSocial(call)) {
          offenders.push(`${fp}:${String(call.getStartLineNumber())}`);
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Social-network write via axios detected:\n  ${offenders.join("\n  ")}\n` +
          "Per invariant §9, PainPilot must NEVER auto-post.",
      );
    }
  });

  it("crawlers under /src/server/sources/ are read-only (no method:'POST' anywhere)", () => {
    const project = makeProject();
    const offenders: string[] = [];

    for (const file of project.getSourceFiles()) {
      const fp = file.getFilePath();
      if (!fp.includes("/src/server/sources/")) continue;
      if (POST_RE.test(file.getFullText())) {
        offenders.push(fp);
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Crawler with POST detected in:\n  ${offenders.join("\n  ")}\n` +
          "Crawlers must be strictly read-only.",
      );
    }
  });
});
