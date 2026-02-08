import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
  notes?: string | null;
};

type DatePlanHistoryItem = {
  id: string;
  itinerary: Array<{ time: string; activity: string; details: string }>;
  venueOptions: Array<{ name: string; reason: string; link?: string }>;
  estimatedCost: number;
  rationale: string;
  providerMeta: {
    sources: {
      perplexity_links: string[];
      firecrawl_extracts_count: number;
    };
  };
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow1HappyPath(page: Page) {
  let isAuthenticated = false;
  let userEmail = "test@example.com";
  const userId = "user-e2e-1";
  const partnerProfiles: PartnerProfile[] = [];
  const datePlans: DatePlanHistoryItem[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      if (!isAuthenticated) {
        await fulfillJson(route, 401, { error: "AUTH_REQUIRED", code: "AUTH_REQUIRED" });
        return;
      }

      await fulfillJson(route, 200, {
        user: {
          id: userId,
          email: userEmail,
          name: "E2E User",
        },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      const body = request.postDataJSON() as { email?: string };
      userEmail = body.email ?? userEmail;
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "E2E User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-1" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        date_plans: datePlans,
      });
      return;
    }

    if (url.pathname === "/api/partner-profile" && request.method() === "POST") {
      const body = request.postDataJSON() as { name?: string; interests?: string[]; notes?: string };
      const profile: PartnerProfile = {
        id: `profile-${partnerProfiles.length + 1}`,
        name: body.name ?? "Partner",
        interests: body.interests ?? [],
        notes: body.notes ?? null,
      };
      partnerProfiles.push(profile);
      await fulfillJson(route, 200, { profile });
      return;
    }

    if (url.pathname === "/api/plan/date" && request.method() === "POST") {
      const planId = `plan-${datePlans.length + 1}`;
      const payload = {
        plan_id: planId,
        itinerary: [
          { time: "6:00 PM", activity: "Sunset walk", details: "Waterfront stroll together" },
          { time: "8:00 PM", activity: "Dinner", details: "Cozy candlelight table" },
        ],
        venue_options: [
          { name: "Skyline Bistro", reason: "Romantic city view", link: "https://example.com/bistro" },
        ],
        estimated_cost: 180,
        rationale: "Balanced cozy vibe with scenic views and easy logistics.",
        sources: {
          perplexity_links: ["https://example.com/source-1"],
          firecrawl_extracts_count: 1,
        },
      };

      datePlans.push({
        id: payload.plan_id,
        itinerary: payload.itinerary,
        venueOptions: payload.venue_options,
        estimatedCost: payload.estimated_cost,
        rationale: payload.rationale,
        providerMeta: {
          sources: payload.sources,
        },
      });

      await fulfillJson(route, 200, payload);
      return;
    }

    await route.continue();
  });
}

test("register -> create partner -> generate plan -> history visible", async ({ page }) => {
  await mockFlow1HappyPath(page);

  await page.goto("/flow-1");

  await expect(page.getByTestId("flow1-auth-panel")).toBeVisible();
  await page.getByTestId("flow1-auth-name").fill("E2E User");
  await page.getByTestId("flow1-auth-email").fill("test@example.com");
  await page.getByTestId("flow1-auth-password").fill("password123");
  await page.getByTestId("flow1-auth-password").press("Enter");

  await expect(page.getByTestId("flow1-partner-panel")).toBeVisible();
  await page.getByTestId("flow1-profile-name").fill("Taylor");
  await page.getByTestId("flow1-profile-interests").fill("music,dinner,travel");
  await page.getByTestId("flow1-profile-create").click();

  await expect(page.getByTestId("flow1-profile-list")).toBeVisible();
  await expect(page.getByTestId("flow1-profile-continue")).toBeEnabled();
  await page.getByTestId("flow1-profile-continue").click();

  await expect(page.getByTestId("flow1-date-panel")).toBeVisible();
  await page.getByTestId("flow1-date-city").fill("Austin");
  await page.getByTestId("flow1-date-budget").fill("180");
  await page.getByTestId("flow1-date-time").fill("2026-02-14T19:00:00.000Z");
  await page.getByTestId("flow1-date-time").press("Enter");

  await expect(page.getByTestId("flow1-result-panel")).toBeVisible();
  await expect(page.getByText("Saved plan ID: plan-1")).toBeVisible();
  await expect(page.getByTestId("flow1-history-list")).toBeVisible();
  await expect(page.getByTestId("flow1-history-item-plan-1")).toBeVisible();
});
