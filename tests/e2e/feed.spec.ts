import { expect, test } from "@playwright/test";

/**
 * E2E for the Phase 2 cluster feed surface.
 *
 * Real cluster content requires a populated Supabase + a successful Inngest
 * crawl-then-cluster run. In CI / sandbox we cover the gated routing:
 * unauthenticated requests to every new /app/* route bounce to /login with
 * the correct `next` param. Authed deep-tests live alongside staging.
 */

test.describe("cluster feed routing", () => {
  test("/app redirects unauthed to /login?next=/app", async ({ page }) => {
    const res = await page.goto("/app");
    expect(res?.url()).toContain("/login");
    expect(res?.url()).toContain("next=%2Fapp");
  });

  test("/app/saved redirects unauthed to /login?next=/app/saved", async ({ page }) => {
    const res = await page.goto("/app/saved");
    expect(res?.url()).toContain("/login");
    expect(res?.url()).toContain("next=%2Fapp%2Fsaved");
  });

  test("/app/clusters/<id> redirects unauthed to /login with that next path", async ({ page }) => {
    const res = await page.goto("/app/clusters/00000000-0000-0000-0000-000000000000");
    expect(res?.url()).toContain("/login");
    expect(res?.url()).toContain("next=%2Fapp%2Fclusters%2F");
  });
});
