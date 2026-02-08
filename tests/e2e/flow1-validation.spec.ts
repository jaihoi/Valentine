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

async function mockFlow1Validation(page: Page) {
  let isAuthenticated = false;
  let userEmail = "validate@example.com";
  let registerCalls = 0;
  let partnerCreateCalls = 0;
  let planCalls = 0;

  const userId = "user-e2e-validation";
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
          name: "Validation User",
        },
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

    if (url.pathname === "/api/history/flow-1" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        date_plans: datePlans,
      });
      return;
    }

    if (url.pathname === "/api/partner-profile" && request.method() === "POST") {
      partnerCreateCalls += 1;
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
      planCalls += 1;
      const payload = {
        plan_id: `plan-${planCalls}`,
        itinerary: [
          { time: "6:30 PM", activity: "Walk", details: "Riverfront walk" },
        ],
        venue_options: [
          { name: "Cozy Spot", reason: "Low travel and calm ambience", link: "https://example.com/spot" },
        ],
        estimated_cost: 150,
        rationale: "Simple plan for validation flow coverage.",
        sources: {
          perplexity_links: ["https://example.com/source-validation"],
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
    getRegisterCalls: () => registerCalls,
    getPartnerCreateCalls: () => partnerCreateCalls,
    getPlanCalls: () => planCalls,
  };
}

test("validation blocks invalid submits and keyboard flow completes end-to-end", async ({
  page,
}) => {
  const counters = await mockFlow1Validation(page);

  await page.goto("/flow-1");

  await expect(page.getByTestId("flow1-auth-panel")).toBeVisible();
  await page.getByTestId("flow1-auth-register").click();
  await expect(page.getByText("Name is required to register.")).toBeVisible();
  await expect(page.getByText("Email is required.")).toBeVisible();
  await expect(page.getByText("Password is required.")).toBeVisible();
  expect(counters.getRegisterCalls()).toBe(0);

  await page.getByTestId("flow1-auth-name").fill("Validation User");
  await page.getByTestId("flow1-auth-email").fill("invalid-email");
  await page.getByTestId("flow1-auth-password").fill("short");
  await page.getByTestId("flow1-auth-register").click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
  expect(counters.getRegisterCalls()).toBe(0);

  await page.getByTestId("flow1-auth-email").fill("validate@example.com");
  await page.getByTestId("flow1-auth-password").fill("password123");
  await page.getByTestId("flow1-auth-password").press("Enter");
  await expect(page.getByTestId("flow1-partner-panel")).toBeVisible();
  expect(counters.getRegisterCalls()).toBe(1);

  await page.getByTestId("flow1-profile-name").fill("");
  await page.getByTestId("flow1-profile-interests").fill(" , ");
  await page.getByTestId("flow1-profile-create").click();
  await expect(page.getByText("Partner name is required.")).toBeVisible();
  await expect(page.getByText("Add at least one interest.")).toBeVisible();
  expect(counters.getPartnerCreateCalls()).toBe(0);

  await page.getByTestId("flow1-profile-name").fill("Jordan");
  await page.getByTestId("flow1-profile-interests").fill("music,dinner");
  await page.getByTestId("flow1-profile-interests").press("Enter");
  await expect(page.getByTestId("flow1-profile-list")).toBeVisible();
  expect(counters.getPartnerCreateCalls()).toBe(1);

  await page.getByTestId("flow1-profile-continue").click();
  await expect(page.getByTestId("flow1-date-panel")).toBeVisible();

  await page.getByTestId("flow1-date-city").fill("");
  await page.getByTestId("flow1-date-budget").fill("0");
  await page.getByTestId("flow1-date-vibe").fill("");
  await page.getByTestId("flow1-date-time").fill("bad-time");
  await page.getByTestId("flow1-date-submit").click();

  await expect(page.getByText("City is required.")).toBeVisible();
  await expect(page.getByText("Budget must be greater than 0.")).toBeVisible();
  await expect(page.getByText("Vibe is required.")).toBeVisible();
  await expect(page.getByText("Date time must be a valid date/time value.")).toBeVisible();
  expect(counters.getPlanCalls()).toBe(0);

  await page.getByTestId("flow1-date-city").fill("Austin");
  await page.getByTestId("flow1-date-budget").fill("160");
  await page.getByTestId("flow1-date-vibe").fill("cozy");
  await page.getByTestId("flow1-date-time").fill("2026-02-14T19:00:00.000Z");
  await page.getByTestId("flow1-date-time").press("Enter");

  await expect(page.getByTestId("flow1-result-panel")).toBeVisible();
  await expect(page.getByText("Plan saved successfully. You can generate another plan now.")).toBeVisible();
  expect(counters.getPlanCalls()).toBe(1);
});
