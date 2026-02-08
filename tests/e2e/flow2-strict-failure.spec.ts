import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
  notes?: string | null;
};

type HistoryLetter = {
  id: string;
  content: string;
  createdAt: string;
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow2StrictFailure(page: Page) {
  let isAuthenticated = false;
  let userEmail = "strict@example.com";
  const userId = "user-flow2-strict";
  const partnerProfiles: PartnerProfile[] = [];
  const letters: HistoryLetter[] = [];
  let letterAttempts = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      if (!isAuthenticated) {
        await fulfillJson(route, 401, { error: "AUTH_REQUIRED", code: "AUTH_REQUIRED" });
        return;
      }
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Strict User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      const body = request.postDataJSON() as { email?: string };
      userEmail = body.email ?? userEmail;
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Strict User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-2" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        letters,
        voice_assets: [],
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

    if (url.pathname === "/api/flow-2/love-letter" && request.method() === "POST") {
      letterAttempts += 1;
      if (letterAttempts === 1) {
        await fulfillJson(route, 504, {
          error: "Request timed out after 6000ms",
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          provider: "fastrouter",
        });
        return;
      }

      const payload = {
        letter_content_id: "letter-retry-1",
        letter_text: "You are my favorite chapter and my safest home.",
        short_sms: "Forever yours.",
        caption_versions: ["Still us.", "Always us."],
      };
      letters.push({
        id: payload.letter_content_id,
        content: payload.letter_text,
        createdAt: new Date().toISOString(),
      });
      await fulfillJson(route, 200, payload);
      return;
    }

    if (url.pathname === "/api/flow-2/voice" && request.method() === "POST") {
      await fulfillJson(route, 200, {
        audio_asset_id: "voice-retry-1",
        audio_url: "https://example.com/audio/voice-retry-1.mp3",
      });
      return;
    }

    await route.continue();
  });
}

test("strict provider timeout shows actionable error and retry succeeds", async ({
  page,
}) => {
  await mockFlow2StrictFailure(page);

  await page.goto("/flow-2");
  await page.getByTestId("flow2-auth-name").fill("Strict User");
  await page.getByTestId("flow2-auth-email").fill("strict@example.com");
  await page.getByTestId("flow2-auth-password").fill("password123");
  await page.getByTestId("flow2-auth-register").click();

  await page.getByTestId("flow2-profile-name").fill("Mia");
  await page.getByTestId("flow2-profile-interests").fill("music,travel");
  await page.getByTestId("flow2-profile-create").click();
  await page.getByTestId("flow2-profile-continue").click();

  await expect(page.getByTestId("flow2-letter-input-panel")).toBeVisible();
  await page.getByTestId("flow2-letter-submit").click();

  await expect(page.getByTestId("flow2-error-panel")).toBeVisible();
  await expect(page.getByTestId("flow2-error-panel")).toBeFocused();
  await expect(page.getByText("PROVIDER_TIMEOUT")).toBeVisible();
  await expect(page.getByTestId("flow2-error-retry")).toBeVisible();

  await page.getByTestId("flow2-error-retry").click();
  await expect(page.getByTestId("flow2-letter-result-panel")).toBeVisible();
});
