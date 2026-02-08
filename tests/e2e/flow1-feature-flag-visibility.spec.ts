import { expect, test, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

test("flow1-only mode hides non-flow modules on dashboard", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await fulfillJson(route, 401, { error: "AUTH_REQUIRED", code: "AUTH_REQUIRED" });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Flow 1 Mode" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Flow 1 Wizard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gift Finder" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Love Letter + Voice" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Memory Card Studio" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "AI Valentine Hotline" })).toHaveCount(0);
});
