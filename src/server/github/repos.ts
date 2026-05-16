/**
 * GitHub repo operations used by the Ship Inngest pipeline.
 *
 * Real implementation hits api.github.com via fetch with an installation
 * token (NOT the App JWT — installation tokens scope to a specific org/user).
 *
 * `GITHUB_STUB=1` short-circuits every method to synthetic responses with
 * deterministic SHAs so tests + verify can exercise the pipeline shape
 * without a real GitHub account.
 *
 * Per CI guard rule (a): every POST URL stays on api.github.com — NOT a
 * social-network domain — so the guard is silent on this file.
 */
import { installationToken, isGithubStubbed } from "./app";

const API = "https://api.github.com";

interface FetchOpts {
  installationId: number;
  method?: string;
  path: string;
  body?: unknown;
}

async function ghFetch<T>(opts: FetchOpts): Promise<T> {
  if (isGithubStubbed()) {
    throw new Error("ghFetch called in stub mode — wrap callsites with the stub check first");
  }
  const token = await installationToken(opts.installationId);
  const res = await fetch(`${API}${opts.path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "PainPilot/0.1",
      "Content-Type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok) {
    throw new Error(`github ${opts.path}: HTTP ${String(res.status)} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface CreatedRepo {
  owner: string;
  name: string;
  url: string;
  default_branch: string;
}

export async function createRepoFromTemplate(args: {
  installationId: number;
  templateOwner: string;
  templateRepo: string;
  ownerLogin: string; // user or org under the App install
  name: string;
  isPrivate: boolean;
}): Promise<CreatedRepo> {
  if (isGithubStubbed()) {
    return {
      owner: args.ownerLogin,
      name: args.name,
      url: `https://github.com/${args.ownerLogin}/${args.name}`,
      default_branch: "main",
    };
  }
  const body = await ghFetch<{
    owner: { login: string };
    name: string;
    html_url: string;
    default_branch: string;
  }>({
    installationId: args.installationId,
    method: "POST",
    path: `/repos/${args.templateOwner}/${args.templateRepo}/generate`,
    body: {
      owner: args.ownerLogin,
      name: args.name,
      description: "Shipped via PainPilot",
      include_all_branches: false,
      private: args.isPrivate,
    },
  });
  return {
    owner: body.owner.login,
    name: body.name,
    url: body.html_url,
    default_branch: body.default_branch,
  };
}

export interface CommittedTree {
  commitSha: string;
  treeSha: string;
}

/**
 * Commit a set of files as a single tree on the given branch. Real impl
 * uses the Git Data API (create blob → create tree → create commit →
 * update ref). Stub returns deterministic SHAs derived from the file list.
 */
export async function commitTree(args: {
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  baseCommitSha: string | null;
  files: { path: string; contents: string }[];
  message: string;
}): Promise<CommittedTree> {
  if (isGithubStubbed()) {
    // Deterministic stub sha: first 7 chars of the joined-path hash.
    const { createHash } = await import("node:crypto");
    const joined = args.files.map((f) => `${f.path}:${f.contents.length}`).join("|");
    const sha = createHash("sha1").update(joined).digest("hex");
    return { commitSha: sha, treeSha: `tree-${sha.slice(0, 8)}` };
  }

  const blobShas = await Promise.all(
    args.files.map(async (f) => {
      const blob = await ghFetch<{ sha: string }>({
        installationId: args.installationId,
        method: "POST",
        path: `/repos/${args.owner}/${args.repo}/git/blobs`,
        body: { content: f.contents, encoding: "utf-8" },
      });
      return { path: f.path, sha: blob.sha };
    }),
  );

  // If we have a base commit, fetch its tree to use as base_tree.
  let baseTreeSha: string | null = null;
  if (args.baseCommitSha !== null) {
    const baseCommit = await ghFetch<{ tree: { sha: string } }>({
      installationId: args.installationId,
      path: `/repos/${args.owner}/${args.repo}/git/commits/${args.baseCommitSha}`,
    });
    baseTreeSha = baseCommit.tree.sha;
  }

  const tree = await ghFetch<{ sha: string }>({
    installationId: args.installationId,
    method: "POST",
    path: `/repos/${args.owner}/${args.repo}/git/trees`,
    body: {
      ...(baseTreeSha === null ? {} : { base_tree: baseTreeSha }),
      tree: blobShas.map(({ path, sha }) => ({ path, mode: "100644", type: "blob", sha })),
    },
  });

  const commit = await ghFetch<{ sha: string }>({
    installationId: args.installationId,
    method: "POST",
    path: `/repos/${args.owner}/${args.repo}/git/commits`,
    body: {
      message: args.message,
      tree: tree.sha,
      parents: args.baseCommitSha === null ? [] : [args.baseCommitSha],
    },
  });

  await ghFetch({
    installationId: args.installationId,
    method: "PATCH",
    path: `/repos/${args.owner}/${args.repo}/git/refs/heads/${args.branch}`,
    body: { sha: commit.sha, force: true },
  });

  return { commitSha: commit.sha, treeSha: tree.sha };
}
