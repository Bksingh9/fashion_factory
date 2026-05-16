import { expect, test } from "@playwright/test";

/**
 * E2E happy path: /login → magic-link submit → (mocked exchange) → /app
 *
 * The full Supabase magic-link flow requires a real Supabase project + an
 * inbox to read the link out of. For the in-repo e2e we cover:
 *   1. The login page renders both auth methods.
 *   2. Hitting /app while unauthenticated bounces to /login?next=/app.
 *   3. (Manual / staging-only) the magic-link callback hand-off.
 *
 * Run locally with `pnpm test:e2e` against `pnpm dev`.
 */

test.describe("auth", () => {
  test("login page renders magic-link form and Google button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in to painpilot/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  test("middleware redirects unauthed /app → /login?next=/app", async ({ page }) => {
    const resp = await page.goto("/app");
    expect(resp?.url()).toContain("/login");
    expect(resp?.url()).toContain("next=%2Fapp");
  });

  test("unauthed /app does not leak the Free-plan badge", async ({ page }) => {
    await page.goto("/app");
    // Should be on /login now.
    await expect(page.getByTestId("plan-badge")).toHaveCount(0);
  });
});
