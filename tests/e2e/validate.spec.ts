import { expect, test } from "@playwright/test";

/**
 * E2E for the Phase 3 Validate surface.
 *
 * Authenticated deep flows (real spec generation + lock) require a
 * populated Supabase + Inngest dev server; covered manually in staging.
 * In CI we verify the middleware gates every new route.
 */

test.describe("validate routing", () => {
  test("/app/clusters/<id>/validate redirects unauthed to /login", async ({ page }) => {
    const res = await page.goto("/app/clusters/00000000-0000-0000-0000-000000000000/validate");
    expect(res?.url()).toContain("/login");
    expect(res?.url()).toContain("next=%2Fapp%2Fclusters%2F");
  });
});
