import { expect, test, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

test("dashboard command center shows flow launch links by flags", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await fulfillJson(route, 401, {
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  await page.goto("/");

  const launches = page.getByTestId("dashboard-flow-launches");
  await expect(page.getByTestId("dashboard-command-center")).toBeVisible();
  await expect(launches).toBeVisible();
  await expect(launches.getByRole("link", { name: "Open Flow 1 Wizard" })).toBeVisible();

  const checks = [
    {
      enabled: process.env.NEXT_PUBLIC_FLOW2_ENABLED === "true",
      label: "Open Flow 2 Wizard",
    },
    {
      enabled: process.env.NEXT_PUBLIC_FLOW3_ENABLED === "true",
      label: "Open Flow 3 Wizard",
    },
    {
      enabled: process.env.NEXT_PUBLIC_FLOW4_ENABLED === "true",
      label: "Open Flow 4 Wizard",
    },
    {
      enabled: process.env.NEXT_PUBLIC_FLOW5_ENABLED === "true",
      label: "Open Flow 5 Wizard",
    },
  ];

  for (const check of checks) {
    const link = launches.getByRole("link", { name: check.label });
    if (check.enabled) {
      await expect(link).toBeVisible();
    } else {
      await expect(link).toHaveCount(0);
    }
  }
});
