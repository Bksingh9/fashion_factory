/**
 * Vector math helpers — pure, dependency-free.
 *
 * pgvector serializes vectors over the wire as `"[v1,v2,...,vN]"` strings.
 * JS-side computation needs `number[]`; we convert on the boundary.
 */

export function vectorToString(v: readonly number[]): string {
  return `[${v.join(",")}]`;
}

export function stringToVector(s: string): number[] {
  const trimmed = s.replace(/^\s*\[\s*/, "").replace(/\s*\]\s*$/, "");
  if (trimmed.length === 0) return [];
  return trimmed.split(",").map((x) => Number.parseFloat(x.trim()));
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: dim mismatch (${String(a.length)} vs ${String(b.length)})`,
    );
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Running-mean update for an existing centroid.
 *
 *   new_centroid = (old_centroid * old_count + new_embedding) / (old_count + 1)
 *
 * This is the simplest correct online algorithm for cluster centroid drift —
 * each cluster keeps a precise mean without re-reading all members.
 */
export function updateCentroid(
  centroid: readonly number[],
  oldCount: number,
  next: readonly number[],
): number[] {
  if (centroid.length !== next.length) {
    throw new Error(
      `updateCentroid: dim mismatch (${String(centroid.length)} vs ${String(next.length)})`,
    );
  }
  if (oldCount < 1) {
    throw new Error(`updateCentroid: oldCount must be >= 1, got ${String(oldCount)}`);
  }
  const newCount = oldCount + 1;
  const out: number[] = new Array<number>(centroid.length);
  for (let i = 0; i < centroid.length; i++) {
    out[i] = ((centroid[i] ?? 0) * oldCount + (next[i] ?? 0)) / newCount;
  }
  return out;
}

/** Default cosine-similarity threshold for cluster assignment (voyage-3-large, normalised). */
export const DEFAULT_CLUSTER_THRESHOLD = 0.82;
