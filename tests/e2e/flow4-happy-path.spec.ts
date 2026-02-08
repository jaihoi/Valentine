import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
  notes?: string | null;
};

type VoiceSession = {
  id: string;
  status: "CREATED" | "ACTIVE" | "COMPLETED" | "FAILED";
  scenario: string;
  callLinkOrNumber: string | null;
  createdAt: string;
  updatedAt: string;
  providerMeta?: Record<string, unknown>;
  partnerProfileId?: string | null;
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow4HappyPath(page: Page) {
  let isAuthenticated = false;
  let userEmail = "flow4@example.com";
  const userId = "user-flow4-happy";
  const partnerProfiles: PartnerProfile[] = [];
  const sessions: VoiceSession[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      if (!isAuthenticated) {
        await fulfillJson(route, 401, { error: "Unauthorized", code: "AUTH_REQUIRED" });
        return;
      }
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Flow4 User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      const body = request.postDataJSON() as { email?: string };
      userEmail = body.email ?? userEmail;
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Flow4 User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-4" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        voice_sessions: sessions,
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

    if (url.pathname === "/api/flow-4/session/start" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        scenario: string;
        partner_profile_id: string;
      };

      const session: VoiceSession = {
        id: `session-${sessions.length + 1}`,
        status: "CREATED",
        scenario: body.scenario,
        callLinkOrNumber: `https://example.com/call/session-${sessions.length + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        providerMeta: { flow: "flow4" },
        partnerProfileId: body.partner_profile_id,
      };
      sessions.unshift(session);

      await fulfillJson(route, 200, {
        session_id: session.id,
        call_link_or_number: session.callLinkOrNumber,
        status: session.status,
      });
      return;
    }

    if (url.pathname.startsWith("/api/flow-4/session/") && request.method() === "GET") {
      const sessionId = url.pathname.split("/").pop() ?? "";
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) {
        await fulfillJson(route, 404, {
          error: "session_id not found for current user",
          code: "VALIDATION_ERROR",
          retryable: false,
        });
        return;
      }
      session.status = "COMPLETED";
      session.updatedAt = new Date().toISOString();
      await fulfillJson(route, 200, {
        session_id: session.id,
        call_link_or_number: session.callLinkOrNumber,
        status: session.status,
        updated_at: session.updatedAt,
        provider_meta: { flow: "flow4" },
      });
      return;
    }

    await route.continue();
  });
}

test("flow4 happy path: start session and show history", async ({ page }) => {
  await mockFlow4HappyPath(page);

  await page.goto("/flow-4");

  await page.getByTestId("flow4-auth-name").fill("Flow4 User");
  await page.getByTestId("flow4-auth-email").fill("flow4@example.com");
  await page.getByTestId("flow4-auth-password").fill("password123");
  await page.getByTestId("flow4-auth-register").click();

  await expect(page.getByTestId("flow4-partner-panel")).toBeVisible();
  await page.getByTestId("flow4-profile-name").fill("Ava");
  await page.getByTestId("flow4-profile-interests").fill("music,dinner");
  await page.getByTestId("flow4-profile-create").click();
  await page.getByTestId("flow4-profile-continue").click();

  await expect(page.getByTestId("flow4-scenario-panel")).toBeVisible();
  await page.getByTestId("flow4-scenario-input").fill("Plan a sweet, calm late-evening call.");
  await page.getByTestId("flow4-start-session").click();

  await expect(page.getByTestId("flow4-result-panel")).toBeVisible();
  await expect(page.getByTestId("flow4-call-link")).toBeVisible();
  await expect(page.getByTestId("flow4-history-sessions")).toBeVisible();
});
