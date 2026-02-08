import { expect, test, type Page, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockDashboardApiLab(page: Page) {
  let partnerCreateCalls = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      await fulfillJson(route, 401, {
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
        retryable: false,
      });
      return;
    }

    if (url.pathname === "/api/partner-profile" && request.method() === "POST") {
      partnerCreateCalls += 1;
      const body = request.postDataJSON() as {
        name?: string;
        interests?: string[];
      };

      await fulfillJson(route, 200, {
        profile: {
          id: "profile-lab-1",
          name: body.name ?? "Partner",
          interests: body.interests ?? [],
        },
      });
      return;
    }

    await route.continue();
  });

  return {
    getPartnerCreateCalls: () => partnerCreateCalls,
  };
}

test("advanced API lab stays accessible via details and submits a legacy action", async ({ page }) => {
  const state = await mockDashboardApiLab(page);
  await page.goto("/");

  const apiLab = page.getByTestId("dashboard-api-lab");
  await expect(apiLab).toBeVisible();

  const flow1Details = page.getByTestId("dashboard-api-flow1");
  await expect(flow1Details).toBeVisible();

  await flow1Details.locator("summary").click();
  await expect(flow1Details).toHaveAttribute("open", "");

  await page.getByPlaceholder("Partner name").fill("Morgan");
  await page.getByTestId("dashboard-save-partner-profile").click();

  expect(state.getPartnerCreateCalls()).toBe(1);
  await expect(page.locator("pre")).toContainText("profile-lab-1");
});
