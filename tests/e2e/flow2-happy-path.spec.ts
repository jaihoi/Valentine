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

type HistoryVoiceAsset = {
  id: string;
  sourceText: string;
  audioUrl: string;
  createdAt: string;
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow2HappyPath(page: Page) {
  let isAuthenticated = false;
  let userEmail = "flow2@example.com";
  const userId = "user-flow2-happy";
  const partnerProfiles: PartnerProfile[] = [];
  const letters: HistoryLetter[] = [];
  const voiceAssets: HistoryVoiceAsset[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      if (!isAuthenticated) {
        await fulfillJson(route, 401, { error: "AUTH_REQUIRED", code: "AUTH_REQUIRED" });
        return;
      }

      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Flow2 User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      const body = request.postDataJSON() as { email?: string };
      userEmail = body.email ?? userEmail;
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Flow2 User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-2" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        letters,
        voice_assets: voiceAssets,
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
      const payload = {
        letter_content_id: "letter-1",
        letter_text: "My love, every day with you feels brighter and kinder.",
        short_sms: "Happy Valentine's Day, my love.",
        caption_versions: ["Forever us.", "Always my favorite person."],
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
      const body = request.postDataJSON() as { text?: string };
      const payload = {
        audio_asset_id: "voice-1",
        audio_url: "https://example.com/audio/voice-1.mp3",
      };
      voiceAssets.push({
        id: payload.audio_asset_id,
        sourceText: body.text ?? "",
        audioUrl: payload.audio_url,
        createdAt: new Date().toISOString(),
      });
      await fulfillJson(route, 200, payload);
      return;
    }

    await route.continue();
  });
}

test("register -> partner -> letter -> voice -> result + history", async ({ page }) => {
  await mockFlow2HappyPath(page);

  await page.goto("/flow-2");

  await expect(page.getByTestId("flow2-auth-panel")).toBeVisible();
  await page.getByTestId("flow2-auth-name").fill("Flow2 User");
  await page.getByTestId("flow2-auth-email").fill("flow2@example.com");
  await page.getByTestId("flow2-auth-password").fill("password123");
  await page.getByTestId("flow2-auth-password").press("Enter");

  await expect(page.getByTestId("flow2-partner-panel")).toBeVisible();
  await page.getByTestId("flow2-profile-name").fill("Ava");
  await page.getByTestId("flow2-profile-interests").fill("music,dinner");
  await page.getByTestId("flow2-profile-create").click();
  await expect(page.getByTestId("flow2-profile-continue")).toBeEnabled();
  await page.getByTestId("flow2-profile-continue").click();

  await expect(page.getByTestId("flow2-letter-input-panel")).toBeVisible();
  await page.getByTestId("flow2-letter-tone").fill("heartfelt");
  await page.getByTestId("flow2-letter-memories").fill("our first date;our beach walk");
  await page.getByTestId("flow2-letter-submit").click();

  await expect(page.getByTestId("flow2-letter-result-panel")).toBeVisible();
  await page.getByTestId("flow2-to-voice").click();

  await expect(page.getByTestId("flow2-voice-panel")).toBeVisible();
  await expect(page.getByTestId("flow2-voice-text")).not.toHaveValue("");
  await page.getByTestId("flow2-voice-submit").click();

  await expect(page.getByTestId("flow2-result-panel")).toBeVisible();
  await expect(page.getByText("Letter and voice were both saved successfully.")).toBeVisible();
  await expect(page.getByTestId("flow2-history-letters")).toBeVisible();
  await expect(page.getByTestId("flow2-history-voices")).toBeVisible();
});
