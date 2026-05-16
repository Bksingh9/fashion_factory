import { describe, expect, it } from "vitest";
import { buildPurgeSql } from "@/server/inngest/functions/privacy.purge_authors";

describe("privacy.purge_authors", () => {
  it("buildPurgeSql nulls author + author_collected_at on the signals table", () => {
    const sql = buildPurgeSql();
    expect(sql).toMatch(/update\s+signals/i);
    expect(sql).toMatch(/author\s*=\s*null/i);
    expect(sql).toMatch(/author_collected_at\s*=\s*null/i);
  });

  it("buildPurgeSql gates on the 90-day retention window", () => {
    const sql = buildPurgeSql();
    expect(sql).toMatch(/90 days/i);
    expect(sql).toMatch(/author_collected_at\s*<\s*now\(\)\s*-\s*interval\s+'90 days'/i);
  });

  it("buildPurgeSql exempts signals whose cluster has any cluster_saves row", () => {
    const sql = buildPurgeSql();
    expect(sql).toMatch(/cluster_saves/i);
    expect(sql).toMatch(/not\s+in\s*\(\s*select\s+cluster_id\s+from\s+cluster_saves\s*\)/i);
  });

  it("buildPurgeSql includes the cluster_id IS NULL fallback (orphaned signals)", () => {
    const sql = buildPurgeSql();
    expect(sql).toMatch(/cluster_id\s+is\s+null/i);
  });
});
