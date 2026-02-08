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

async function mockFlow4StrictFailure(page: Page) {
  let isAuthenticated = false;
  const partnerProfiles: PartnerProfile[] = [];
  let startAttempts = 0;
  const startIdempotencyKeys: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      if (!isAuthenticated) {
        await fulfillJson(route, 401, { error: "Unauthorized", code: "AUTH_REQUIRED" });
        return;
      }
      await fulfillJson(route, 200, {
        user: { id: "u1", email: "strict4@example.com", name: "Strict4 User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: "u1", email: "strict4@example.com", name: "Strict4 User" },
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
        id: "profile-1",
        name: "Mia",
        interests: ["music", "dinner"],
      };
      partnerProfiles.push(profile);
      await fulfillJson(route, 200, { profile });
      return;
    }

    if (url.pathname === "/api/flow-4/session/start" && request.method() === "POST") {
      startAttempts += 1;
      startIdempotencyKeys.push(
        (await request.headerValue("Idempotency-Key")) ?? "",
      );
      if (startAttempts === 1) {
        await fulfillJson(route, 504, {
          error: "Request timed out after 6000ms",
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          provider: "vapi",
        });
        return;
      }

      await fulfillJson(route, 200, {
        session_id: "session-retry-1",
        call_link_or_number: "https://example.com/call/retry-1",
        status: "CREATED",
      });
      return;
    }

    if (url.pathname.startsWith("/api/flow-4/session/") && request.method() === "GET") {
      await fulfillJson(route, 200, {
        session_id: "session-retry-1",
        call_link_or_number: "https://example.com/call/retry-1",
        status: "ACTIVE",
        updated_at: new Date().toISOString(),
        provider_meta: { flow: "flow4" },
      });
      return;
    }

    await route.continue();
  });

  return {
    getStartAttempts: () => startAttempts,
    startIdempotencyKeys,
  };
}

test("flow4 strict timeout surfaces typed error and retry works", async ({ page }) => {
  const state = await mockFlow4StrictFailure(page);

  await page.goto("/flow-4");
  await page.getByTestId("flow4-auth-name").fill("Strict4 User");
  await page.getByTestId("flow4-auth-email").fill("strict4@example.com");
  await page.getByTestId("flow4-auth-password").fill("password123");
  await page.getByTestId("flow4-auth-register").click();

  await page.getByTestId("flow4-profile-name").fill("Mia");
  await page.getByTestId("flow4-profile-interests").fill("music,dinner");
  await page.getByTestId("flow4-profile-create").click();
  await page.getByTestId("flow4-profile-continue").click();

  await page.getByTestId("flow4-scenario-input").fill("Run a supportive romantic call.");
  await page.getByTestId("flow4-start-session").click();

  await expect(page.getByTestId("flow4-error-panel")).toBeVisible();
  await expect(page.getByTestId("flow4-error-panel")).toBeFocused();
  await expect(page.getByText("PROVIDER_TIMEOUT")).toBeVisible();
  await expect(page.getByTestId("flow4-error-retry")).toBeVisible();

  await page.getByTestId("flow4-error-retry").click();
  await expect(page.getByTestId("flow4-result-panel")).toBeVisible();
  await expect(page.getByTestId("flow4-call-link")).toBeVisible();
  expect(state.getStartAttempts()).toBe(2);
  expect(state.startIdempotencyKeys).toHaveLength(2);
  expect(state.startIdempotencyKeys[0]).not.toBe("");
  expect(state.startIdempotencyKeys[1]).toBe(state.startIdempotencyKeys[0]);
});
