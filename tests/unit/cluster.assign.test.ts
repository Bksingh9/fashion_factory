import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  DEFAULT_CLUSTER_THRESHOLD,
  stringToVector,
  updateCentroid,
  vectorToString,
} from "@/server/llm/vector";
import { assignClusterForTest, type NeighborCluster } from "@/server/inngest/functions/signal.cluster";

const v = (a: number[]): number[] => a;
const orthogonal8 = [
  v([1, 0, 0, 0, 0, 0, 0, 0]),
  v([0, 1, 0, 0, 0, 0, 0, 0]),
];

describe("vector helpers", () => {
  it("cosineSimilarity is 1 for identical, 0 for orthogonal, -1 for anti-parallel", () => {
    const a = v([1, 0, 0]);
    expect(cosineSimilarity(a, [1, 0, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity(a, [0, 1, 0])).toBeCloseTo(0, 6);
    expect(cosineSimilarity(a, [-1, 0, 0])).toBeCloseTo(-1, 6);
  });

  it("throws on dim mismatch", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow(/dim mismatch/);
  });

  it("updateCentroid: mean of (c*n + new) / (n+1)", () => {
    const c = v([2, 4, 6]);
    const out = updateCentroid(c, 3, [10, 20, 30]);
    // (2*3 + 10)/4 = 4, (4*3 + 20)/4 = 8, (6*3 + 30)/4 = 12
    expect(out[0]).toBeCloseTo(4);
    expect(out[1]).toBeCloseTo(8);
    expect(out[2]).toBeCloseTo(12);
  });

  it("vectorToString / stringToVector roundtrip", () => {
    const v1 = [0.1, -0.2, 3.14];
    expect(stringToVector(vectorToString(v1))).toEqual(v1);
  });
});

describe("assignClusterForTest", () => {
  it("returns matchedId when nearest neighbour is above threshold", () => {
    const target = v([0.9, 0.1, 0, 0, 0, 0, 0, 0]);
    const neighbors: NeighborCluster[] = [
      { id: "cluster-near", centroid: v([1, 0, 0, 0, 0, 0, 0, 0]), member_count: 5 },
      { id: "cluster-far", centroid: orthogonal8[1] ?? [], member_count: 5 },
    ];
    const { matchedId, matchedSim } = assignClusterForTest(
      target,
      neighbors,
      DEFAULT_CLUSTER_THRESHOLD,
    );
    expect(matchedId).toBe("cluster-near");
    expect(matchedSim).toBeGreaterThan(DEFAULT_CLUSTER_THRESHOLD);
  });

  it("returns null (create new) when no neighbour is above threshold", () => {
    const target = orthogonal8[0] ?? [];
    const neighbors: NeighborCluster[] = [
      { id: "cluster-orthogonal", centroid: orthogonal8[1] ?? [], member_count: 5 },
    ];
    const { matchedId, matchedSim } = assignClusterForTest(target, neighbors, 0.5);
    expect(matchedId).toBeNull();
    expect(matchedSim).toBeLessThan(0.5);
  });

  it("returns null when neighbour list is empty", () => {
    const target = v([1, 0, 0, 0, 0, 0, 0, 0]);
    const { matchedId, matchedSim } = assignClusterForTest(target, [], DEFAULT_CLUSTER_THRESHOLD);
    expect(matchedId).toBeNull();
    expect(matchedSim).toBe(0);
  });
});
