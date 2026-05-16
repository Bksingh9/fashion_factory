/**
 * Ship template registry — reads `ship_templates` rows or falls back to
 * the SHIP_TEMPLATE_REPO env override.
 *
 * The default template id is hard-coded; operators can disable it or add
 * new rows without redeploy.
 */
import { env } from "@/env";
import { supabaseService } from "@/server/db/service";

export interface ShipTemplate {
  id: string;
  name: string;
  owner: string;
  repo: string;
  defaultBranch: string;
}

function parseRepoUrl(url: string): { owner: string; repo: string } {
  const m = /github\.com\/([^/]+)\/([^/?#.]+)/i.exec(url);
  if (m === null) throw new Error(`unparseable template repo URL: ${url}`);
  const owner = m[1];
  const repo = m[2];
  if (owner === undefined || repo === undefined) {
    throw new Error(`unparseable template repo URL: ${url}`);
  }
  return { owner, repo };
}

export const DEFAULT_TEMPLATE_ID = "nextjs-starter-stripe";

export async function loadTemplate(id: string): Promise<ShipTemplate> {
  // Env override short-circuits the DB read.
  if (env.SHIP_TEMPLATE_REPO !== undefined && env.SHIP_TEMPLATE_REPO !== null) {
    const { owner, repo } = parseRepoUrl(env.SHIP_TEMPLATE_REPO);
    return {
      id,
      name: `env-override-${id}`,
      owner,
      repo,
      defaultBranch: "main",
    };
  }
  const sb = supabaseService();
  const { data, error } = await sb
    .from("ship_templates")
    .select("id, name, repo_url, default_branch, active")
    .eq("id", id)
    .maybeSingle();
  if (error !== null) throw new Error(`template read: ${error.message}`);
  if (data === null) throw new Error(`template ${id} not found`);
  if (!data.active) throw new Error(`template ${id} is disabled`);
  const { owner, repo } = parseRepoUrl(data.repo_url);
  return {
    id: data.id,
    name: data.name,
    owner,
    repo,
    defaultBranch: data.default_branch,
  };
}
