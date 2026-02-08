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

async function mockFlow4Polling(page: Page) {
  let isAuthenticated = false;
  let statusCalls = 0;
  const partnerProfiles: PartnerProfile[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      if (!isAuthenticated) {
        await fulfillJson(route, 401, { error: "Unauthorized", code: "AUTH_REQUIRED" });
        return;
      }
      await fulfillJson(route, 200, {
        user: { id: "u1", email: "poll4@example.com", name: "Poll4 User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: "u1", email: "poll4@example.com", name: "Poll4 User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-4" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        voice_sessions: [],
      });
      return;
    }

    if (url.pathname === "/api/partner-profile" && request.method() === "POST") {
      const profile: PartnerProfile = {
        id: "profile-poll-1",
        name: "Noah",
        interests: ["music"],
      };
      partnerProfiles.push(profile);
      await fulfillJson(route, 200, { profile });
      return;
    }

    if (url.pathname === "/api/flow-4/session/start" && request.method() === "POST") {
      await fulfillJson(route, 200, {
        session_id: "session-poll-1",
        call_link_or_number: "https://example.com/call/poll-1",
        status: "CREATED",
      });
      return;
    }

    if (url.pathname.startsWith("/api/flow-4/session/") && request.method() === "GET") {
      statusCalls += 1;
      const status = statusCalls === 1 ? "CREATED" : statusCalls === 2 ? "ACTIVE" : "COMPLETED";
      await fulfillJson(route, 200, {
        session_id: "session-poll-1",
        call_link_or_number: "https://example.com/call/poll-1",
        status,
        updated_at: new Date().toISOString(),
        provider_meta: { flow: "flow4" },
      });
      return;
    }

    await route.continue();
  });
}

test("flow4 polling transitions to completed status", async ({ page }) => {
  await mockFlow4Polling(page);

  await page.goto("/flow-4");
  await page.getByTestId("flow4-auth-name").fill("Poll4 User");
  await page.getByTestId("flow4-auth-email").fill("poll4@example.com");
  await page.getByTestId("flow4-auth-password").fill("password123");
  await page.getByTestId("flow4-auth-register").click();

  await page.getByTestId("flow4-profile-name").fill("Noah");
  await page.getByTestId("flow4-profile-interests").fill("music,dinner");
  await page.getByTestId("flow4-profile-create").click();
  await page.getByTestId("flow4-profile-continue").click();

  await page.getByTestId("flow4-start-session").click();

  await expect(page.getByTestId("flow4-result-panel")).toBeVisible();
  await expect(page.getByText("Status: COMPLETED")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("flow4-status-message")).toContainText("completed");
});
