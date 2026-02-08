import { expect, test, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

test("flow5 links follow NEXT_PUBLIC_FLOW5_ENABLED flag", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await fulfillJson(route, 401, {
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  const flow5Enabled = process.env.NEXT_PUBLIC_FLOW5_ENABLED === "true";
  await page.goto("/");

  if (flow5Enabled) {
    await expect(page.getByRole("link", { name: "Start Flow 5" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Flow 5 Wizard" })).toBeVisible();
  } else {
    await expect(page.getByRole("link", { name: "Start Flow 5" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Flow 5 Wizard" })).toHaveCount(
      0,
    );
  }
});
