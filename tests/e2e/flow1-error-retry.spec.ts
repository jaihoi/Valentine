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

async function mockFlow1RetryCase(page: Page) {
  let isAuthenticated = false;
  let userEmail = "retry@example.com";
  const userId = "user-e2e-retry";
  const partnerProfiles: PartnerProfile[] = [];
  const datePlans: DatePlanHistoryItem[] = [];
  let planAttempts = 0;
  const planIdempotencyKeys: string[] = [];

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
          name: "Retry User",
        },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      const body = request.postDataJSON() as { email?: string };
      userEmail = body.email ?? userEmail;
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Retry User" },
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
      planAttempts += 1;
      planIdempotencyKeys.push(
        (await request.headerValue("Idempotency-Key")) ?? "",
      );

      if (planAttempts === 1) {
        await fulfillJson(route, 504, {
          error: "Provider timed out. Retry shortly.",
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          provider: "perplexity",
        });
        return;
      }

      const payload = {
        plan_id: "plan-retry-1",
        itinerary: [
          { time: "7:00 PM", activity: "Dessert stop", details: "Try a specialty tasting menu" },
        ],
        venue_options: [
          { name: "Moonlight Cafe", reason: "Quiet atmosphere", link: "https://example.com/cafe" },
        ],
        estimated_cost: 140,
        rationale: "Compact evening with low travel overhead and cozy pacing.",
        sources: {
          perplexity_links: ["https://example.com/source-retry"],
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

  return {
    getPlanAttempts: () => planAttempts,
    planIdempotencyKeys,
  };
}

test("provider timeout shows retry and succeeds on retry", async ({ page }) => {
  const state = await mockFlow1RetryCase(page);

  await page.goto("/flow-1");

  await page.getByTestId("flow1-auth-name").fill("Retry User");
  await page.getByTestId("flow1-auth-email").fill("retry@example.com");
  await page.getByTestId("flow1-auth-password").fill("password123");
  await page.getByTestId("flow1-auth-register").click();

  await page.getByTestId("flow1-profile-name").fill("Jordan");
  await page.getByTestId("flow1-profile-create").click();
  await page.getByTestId("flow1-profile-continue").click();

  await expect(page.getByTestId("flow1-date-panel")).toBeVisible();
  await page.getByTestId("flow1-date-submit").click();

  await expect(page.getByTestId("flow1-error-panel")).toBeVisible();
  await expect(page.getByTestId("flow1-error-panel")).toBeFocused();
  await expect(page.getByText("PROVIDER_TIMEOUT")).toBeVisible();
  await expect(page.getByTestId("flow1-error-retry")).toBeVisible();

  await page.getByTestId("flow1-error-retry").click();

  await expect(page.getByTestId("flow1-result-panel")).toBeVisible();
  await expect(page.getByText("Saved plan ID: plan-retry-1")).toBeVisible();
  await expect(page.getByTestId("flow1-history-item-plan-retry-1")).toBeVisible();
  expect(state.getPlanAttempts()).toBe(2);
  expect(state.planIdempotencyKeys).toHaveLength(2);
  expect(state.planIdempotencyKeys[0]).not.toBe("");
  expect(state.planIdempotencyKeys[1]).toBe(state.planIdempotencyKeys[0]);
});
