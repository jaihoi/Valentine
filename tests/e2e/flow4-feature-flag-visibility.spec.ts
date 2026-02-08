import { expect, test, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

test("flow4 links follow NEXT_PUBLIC_FLOW4_ENABLED flag", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await fulfillJson(route, 401, {
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  const flow4Enabled = process.env.NEXT_PUBLIC_FLOW4_ENABLED === "true";
  await page.goto("/");

  if (flow4Enabled) {
    await expect(page.getByRole("link", { name: "Start Flow 4" })).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Open Flow 4 Wizard" })).toBeVisible();
  } else {
    await expect(page.getByRole("link", { name: "Start Flow 4" })).toHaveCount(0);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Open Flow 4 Wizard" })).toHaveCount(
      0,
    );
  }
});
