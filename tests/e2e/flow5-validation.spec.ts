import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
  notes?: string | null;
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow5Validation(page: Page) {
  let isAuthenticated = false;
  let userEmail = "validate-flow5@example.com";
  const userId = "user-flow5-validation";
  const partnerProfiles: PartnerProfile[] = [];
  let registerCalls = 0;
  let partnerCreateCalls = 0;
  let giftCalls = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      if (!isAuthenticated) {
        await fulfillJson(route, 401, {
          error: "Unauthorized",
          code: "AUTH_REQUIRED",
          retryable: false,
        });
        return;
      }
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Validation User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      registerCalls += 1;
      const body = request.postDataJSON() as { email?: string };
      userEmail = body.email ?? userEmail;
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Validation User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-5" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        gift_recommendations: [],
      });
      return;
    }

    if (url.pathname === "/api/partner-profile" && request.method() === "POST") {
      partnerCreateCalls += 1;
      const body = request.postDataJSON() as { name?: string; interests?: string[] };
      const profile: PartnerProfile = {
        id: `profile-${partnerProfiles.length + 1}`,
        name: body.name ?? "Partner",
        interests: body.interests ?? [],
        notes: null,
      };
      partnerProfiles.push(profile);
      await fulfillJson(route, 200, { profile });
      return;
    }

    if (url.pathname === "/api/flow-5/gifts/recommend" && request.method() === "POST") {
      giftCalls += 1;
      await fulfillJson(route, 200, {
        gift_recommendation_id: "cm0p4kqsf0006a0i7sd8udxv6",
        recommendations: [
          {
            title: "Validation Gift",
            reason: "Fits provided interests.",
            estimated_price: 42,
          },
        ],
        explanation: "Validation success output",
        links: ["https://example.com/validation-gift"],
        sources: {
          perplexity_links: ["https://example.com/validation-gift"],
          firecrawl_extracts_count: 1,
        },
      });
      return;
    }

    await route.continue();
  });

  return {
    getRegisterCalls: () => registerCalls,
    getPartnerCreateCalls: () => partnerCreateCalls,
    getGiftCalls: () => giftCalls,
  };
}

test("flow5 validation blocks invalid submits and keyboard flow succeeds", async ({
  page,
}) => {
  const counters = await mockFlow5Validation(page);

  await page.goto("/flow-5");
  await expect(page.getByTestId("flow5-auth-panel")).toBeVisible();

  await page.getByTestId("flow5-auth-register").click();
  await expect(page.getByText("Name is required to register.")).toBeVisible();
  await expect(page.getByText("Email is required.")).toBeVisible();
  await expect(page.getByText("Password is required.")).toBeVisible();
  expect(counters.getRegisterCalls()).toBe(0);

  await page.getByTestId("flow5-auth-name").fill("Validation User");
  await page.getByTestId("flow5-auth-email").fill("validate-flow5@example.com");
  await page.getByTestId("flow5-auth-password").fill("password123");
  await page.getByTestId("flow5-auth-password").press("Enter");
  await expect(page.getByTestId("flow5-partner-panel")).toBeVisible();
  expect(counters.getRegisterCalls()).toBe(1);

  await page.getByTestId("flow5-profile-name").fill("");
  await page.getByTestId("flow5-profile-interests").fill(" ");
  await page.getByTestId("flow5-profile-create").click();
  await expect(page.getByText("Partner name is required.")).toBeVisible();
  await expect(page.getByText("Add at least one interest.")).toBeVisible();
  expect(counters.getPartnerCreateCalls()).toBe(0);

  await page.getByTestId("flow5-profile-name").fill("Ava");
  await page.getByTestId("flow5-profile-interests").fill("music,dinner");
  await page.getByTestId("flow5-profile-interests").press("Enter");
  expect(counters.getPartnerCreateCalls()).toBe(1);

  await page.getByTestId("flow5-profile-continue").click();
  await expect(page.getByTestId("flow5-gift-panel")).toBeVisible();

  await page.getByTestId("flow5-gift-interests").fill(" ");
  await page.getByTestId("flow5-gift-budget").fill("0");
  await page.getByTestId("flow5-gift-submit").click();
  await expect(page.getByText("Add at least one interest.")).toBeVisible();
  await expect(page.getByText("Budget must be greater than 0.")).toBeVisible();
  expect(counters.getGiftCalls()).toBe(0);

  await page.getByTestId("flow5-gift-interests").fill("music,coffee");
  await page.getByTestId("flow5-gift-budget").fill("140");
  await page.getByTestId("flow5-gift-budget").press("Enter");

  await expect(page.getByTestId("flow5-result-panel")).toBeVisible();
  expect(counters.getGiftCalls()).toBe(1);
});
