import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
  notes?: string | null;
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow2Validation(page: Page) {
  let isAuthenticated = false;
  let userEmail = "validate-flow2@example.com";
  const userId = "user-flow2-validation";
  const partnerProfiles: PartnerProfile[] = [];
  let registerCalls = 0;
  let partnerCreateCalls = 0;
  let letterCalls = 0;
  let voiceCalls = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      if (!isAuthenticated) {
        await fulfillJson(route, 401, { error: "AUTH_REQUIRED", code: "AUTH_REQUIRED" });
        return;
      }
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Validation User" },
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

    if (url.pathname === "/api/history/flow-2" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        letters: [],
        voice_assets: [],
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

    if (url.pathname === "/api/flow-2/love-letter" && request.method() === "POST") {
      letterCalls += 1;
      await fulfillJson(route, 200, {
        letter_content_id: "letter-validation-1",
        letter_text: "You make every day feel soft and bright.",
        short_sms: "Always yours.",
        caption_versions: ["You + me", "Always and always"],
      });
      return;
    }

    if (url.pathname === "/api/flow-2/voice" && request.method() === "POST") {
      voiceCalls += 1;
      await fulfillJson(route, 200, {
        audio_asset_id: "voice-validation-1",
        audio_url: "https://example.com/audio/voice-validation-1.mp3",
      });
      return;
    }

    await route.continue();
  });

  return {
    getRegisterCalls: () => registerCalls,
    getPartnerCreateCalls: () => partnerCreateCalls,
    getLetterCalls: () => letterCalls,
    getVoiceCalls: () => voiceCalls,
  };
}

test("flow2 client validation blocks bad submits and keyboard flow succeeds", async ({
  page,
}) => {
  const counters = await mockFlow2Validation(page);

  await page.goto("/flow-2");
  await expect(page.getByTestId("flow2-auth-panel")).toBeVisible();

  await page.getByTestId("flow2-auth-register").click();
  await expect(page.getByText("Name is required to register.")).toBeVisible();
  await expect(page.getByText("Email is required.")).toBeVisible();
  await expect(page.getByText("Password is required.")).toBeVisible();
  expect(counters.getRegisterCalls()).toBe(0);

  await page.getByTestId("flow2-auth-name").fill("Validation User");
  await page.getByTestId("flow2-auth-email").fill("validate-flow2@example.com");
  await page.getByTestId("flow2-auth-password").fill("password123");
  await page.getByTestId("flow2-auth-password").press("Enter");
  await expect(page.getByTestId("flow2-partner-panel")).toBeVisible();
  expect(counters.getRegisterCalls()).toBe(1);

  await page.getByTestId("flow2-profile-name").fill("");
  await page.getByTestId("flow2-profile-interests").fill(" ");
  await page.getByTestId("flow2-profile-create").click();
  await expect(page.getByText("Partner name is required.")).toBeVisible();
  await expect(page.getByText("Add at least one interest.")).toBeVisible();
  expect(counters.getPartnerCreateCalls()).toBe(0);

  await page.getByTestId("flow2-profile-name").fill("Ava");
  await page.getByTestId("flow2-profile-interests").fill("music,dinner");
  await page.getByTestId("flow2-profile-interests").press("Enter");
  expect(counters.getPartnerCreateCalls()).toBe(1);

  await page.getByTestId("flow2-profile-continue").click();
  await expect(page.getByTestId("flow2-letter-input-panel")).toBeVisible();

  await page.getByTestId("flow2-letter-tone").fill("a");
  await page.getByTestId("flow2-letter-memories").fill(" ");
  await page.getByTestId("flow2-letter-submit").click();
  await expect(page.getByText("Tone must be at least 2 characters.")).toBeVisible();
  await expect(page.getByText("Add at least one memory.")).toBeVisible();
  expect(counters.getLetterCalls()).toBe(0);

  await page.getByTestId("flow2-letter-tone").fill("heartfelt");
  await page.getByTestId("flow2-letter-memories").fill("first date;road trip");
  await page.getByTestId("flow2-letter-memories").press("Enter");
  await expect(page.getByTestId("flow2-letter-result-panel")).toBeVisible();
  expect(counters.getLetterCalls()).toBe(1);

  await page.getByTestId("flow2-to-voice").click();
  await expect(page.getByTestId("flow2-voice-panel")).toBeVisible();

  await page.getByTestId("flow2-voice-text").fill(" ");
  await page.getByTestId("flow2-voice-submit").click();
  await expect(page.getByText("Voice text is required.")).toBeVisible();
  expect(counters.getVoiceCalls()).toBe(0);

  await page.getByTestId("flow2-voice-text").fill("Happy Valentine's Day.");
  await page.getByTestId("flow2-voice-text").press("Enter");
  await expect(page.getByTestId("flow2-result-panel")).toBeVisible();
  expect(counters.getVoiceCalls()).toBe(1);
});
