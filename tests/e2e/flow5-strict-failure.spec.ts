import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow5StrictFailure(page: Page) {
  let isAuthenticated = false;
  const partnerProfiles: PartnerProfile[] = [];
  let recommendationAttempts = 0;
  const recommendationIdempotencyKeys: string[] = [];

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
        user: { id: "u1", email: "strict5@example.com", name: "Strict5 User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: "u1", email: "strict5@example.com", name: "Strict5 User" },
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
      const profile: PartnerProfile = {
        id: "profile-1",
        name: "Mia",
        interests: ["music", "coffee"],
      };
      partnerProfiles.push(profile);
      await fulfillJson(route, 200, { profile });
      return;
    }

    if (url.pathname === "/api/flow-5/gifts/recommend" && request.method() === "POST") {
      recommendationAttempts += 1;
      recommendationIdempotencyKeys.push(
        (await request.headerValue("Idempotency-Key")) ?? "",
      );
      if (recommendationAttempts === 1) {
        await fulfillJson(route, 504, {
          error: "Request timed out after 4000ms",
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          provider: "perplexity",
        });
        return;
      }

      await fulfillJson(route, 200, {
        gift_recommendation_id: "cm0p4kqsf0005a0i7sd8udxv5",
        recommendations: [
          {
            title: "Coffee Date Box",
            reason: "Matches coffee interest and budget.",
            estimated_price: 55,
          },
        ],
        explanation: "Recommendation generated after retry.",
        links: ["https://example.com/coffee-box"],
        sources: {
          perplexity_links: ["https://example.com/coffee-box"],
          firecrawl_extracts_count: 1,
        },
      });
      return;
    }

    await route.continue();
  });

  return {
    getRecommendationAttempts: () => recommendationAttempts,
    recommendationIdempotencyKeys,
  };
}

test("flow5 strict timeout surfaces typed error and retry works", async ({ page }) => {
  const state = await mockFlow5StrictFailure(page);

  await page.goto("/flow-5");
  await page.getByTestId("flow5-auth-name").fill("Strict5 User");
  await page.getByTestId("flow5-auth-email").fill("strict5@example.com");
  await page.getByTestId("flow5-auth-password").fill("password123");
  await page.getByTestId("flow5-auth-register").click();

  await page.getByTestId("flow5-profile-name").fill("Mia");
  await page.getByTestId("flow5-profile-interests").fill("music,coffee");
  await page.getByTestId("flow5-profile-create").click();
  await page.getByTestId("flow5-profile-continue").click();

  await page.getByTestId("flow5-gift-interests").fill("coffee,music");
  await page.getByTestId("flow5-gift-budget").fill("90");
  await page.getByTestId("flow5-gift-submit").click();

  await expect(page.getByTestId("flow5-error-panel")).toBeVisible();
  await expect(page.getByTestId("flow5-error-panel")).toBeFocused();
  await expect(page.getByText("PROVIDER_TIMEOUT")).toBeVisible();
  await expect(page.getByTestId("flow5-error-retry")).toBeVisible();

  await page.getByTestId("flow5-error-retry").click();
  await expect(page.getByTestId("flow5-result-panel")).toBeVisible();
  await expect(page.getByTestId("flow5-result-id")).toBeVisible();
  expect(state.getRecommendationAttempts()).toBe(2);
  expect(state.recommendationIdempotencyKeys).toHaveLength(2);
  expect(state.recommendationIdempotencyKeys[0]).not.toBe("");
  expect(state.recommendationIdempotencyKeys[1]).toBe(
    state.recommendationIdempotencyKeys[0],
  );
});
