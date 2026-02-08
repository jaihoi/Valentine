import { expect, test, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

test("home is customer-only and dashboard command center lives on /dashboard", async ({
  page,
}) => {
  await page.route("**/api/auth/me", async (route) => {
    await fulfillJson(route, 401, {
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("dashboard-command-center")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Choose Your Flow" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-command-center")).toBeVisible();
  await expect(page.getByTestId("dashboard-flow-launches")).toBeVisible();
});
