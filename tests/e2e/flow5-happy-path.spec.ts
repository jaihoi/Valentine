import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
  notes?: string | null;
};

type GiftHistoryItem = {
  id: string;
  partnerProfileId?: string | null;
  interests: string[];
  budget: number;
  constraints?: string | null;
  recommendations: Array<{
    title: string;
    reason: string;
    estimated_price: number;
  }>;
  explanation: string;
  links: string[];
  providerMeta?: Record<string, unknown>;
  createdAt: string;
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow5HappyPath(page: Page) {
  let isAuthenticated = false;
  let userEmail = "flow5@example.com";
  const userId = "user-flow5-happy";
  const partnerProfiles: PartnerProfile[] = [];
  const gifts: GiftHistoryItem[] = [];

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
        user: { id: userId, email: userEmail, name: "Flow5 User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      const body = request.postDataJSON() as { email?: string };
      userEmail = body.email ?? userEmail;
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Flow5 User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-5" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        gift_recommendations: gifts,
      });
      return;
    }

    if (url.pathname === "/api/partner-profile" && request.method() === "POST") {
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
      const body = request.postDataJSON() as {
        partner_profile_id: string;
        interests: string[];
        budget: number;
        constraints?: string;
      };

      const payload = {
        gift_recommendation_id: "cm0p4kqsf0004a0i7sd8udxv4",
        recommendations: [
          {
            title: "Vinyl Listening Night Kit",
            reason: "Fits music interests and creates a shared experience.",
            estimated_price: 78,
          },
        ],
        explanation: "Strict provider-backed recommendation selected for your profile.",
        links: ["https://example.com/vinyl-kit"],
        sources: {
          perplexity_links: ["https://example.com/vinyl-kit"],
          firecrawl_extracts_count: 1,
        },
      };

      gifts.unshift({
        id: payload.gift_recommendation_id,
        partnerProfileId: body.partner_profile_id,
        interests: body.interests,
        budget: body.budget,
        constraints: body.constraints ?? null,
        recommendations: payload.recommendations,
        explanation: payload.explanation,
        links: payload.links,
        providerMeta: { flow: "flow5" },
        createdAt: new Date().toISOString(),
      });

      await fulfillJson(route, 200, payload);
      return;
    }

    await route.continue();
  });
}

test("flow5 happy path: generate strict gifts and show history", async ({ page }) => {
  await mockFlow5HappyPath(page);

  await page.goto("/flow-5");
  await page.getByTestId("flow5-auth-name").fill("Flow5 User");
  await page.getByTestId("flow5-auth-email").fill("flow5@example.com");
  await page.getByTestId("flow5-auth-password").fill("password123");
  await page.getByTestId("flow5-auth-register").click();

  await expect(page.getByTestId("flow5-partner-panel")).toBeVisible();
  await page.getByTestId("flow5-profile-name").fill("Ava");
  await page.getByTestId("flow5-profile-interests").fill("music,dinner");
  await page.getByTestId("flow5-profile-create").click();
  await page.getByTestId("flow5-profile-continue").click();

  await expect(page.getByTestId("flow5-gift-panel")).toBeVisible();
  await page.getByTestId("flow5-gift-interests").fill("music,vinyl");
  await page.getByTestId("flow5-gift-budget").fill("120");
  await page.getByTestId("flow5-gift-constraints").fill("no jewelry");
  await page.getByTestId("flow5-gift-submit").click();

  await expect(page.getByTestId("flow5-result-panel")).toBeVisible();
  await expect(page.getByTestId("flow5-result-explanation")).toBeVisible();
  await expect(page.getByTestId("flow5-history-gifts")).toBeVisible();
});
