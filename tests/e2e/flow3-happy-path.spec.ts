import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
  notes?: string | null;
};

type MemoryAsset = {
  id: string;
  cloudinaryId: string;
  secureUrl: string;
  resourceType: string;
  createdAt: string;
};

type CardItem = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  previewUrl: string | null;
  errorMessage?: string | null;
  templateId: string;
  messageText: string;
  createdAt: string;
  partnerProfileId?: string;
};

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow3HappyPath(page: Page) {
  let isAuthenticated = false;
  const userId = "user-flow3-happy";
  let userEmail = "flow3@example.com";
  const partnerProfiles: PartnerProfile[] = [];
  const assets: MemoryAsset[] = [];
  const cards: CardItem[] = [];

  await page.route("**/*", async (route) => {
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
        user: { id: userId, email: userEmail, name: "Flow3 User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      const body = request.postDataJSON() as { email?: string };
      userEmail = body.email ?? userEmail;
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: userEmail, name: "Flow3 User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-3" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        memory_assets: assets,
        cards,
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

    if (
      url.pathname === "/api/media/upload-signature" &&
      request.method() === "POST"
    ) {
      await fulfillJson(route, 200, {
        cloudinary_signature: "mock-signature",
        timestamp: 1234567890,
        folder: `valentine/user-${userId}/memory-assets`,
        cloud_name: "demo",
        api_key: "mock-api-key",
      });
      return;
    }

    if (
      url.hostname === "api.cloudinary.com" &&
      url.pathname.includes("/upload") &&
      request.method() === "POST"
    ) {
      await fulfillJson(route, 200, {
        public_id: `valentine/user-${userId}/memory-assets/photo-1`,
        secure_url: "https://res.cloudinary.com/demo/image/upload/photo-1.jpg",
        resource_type: "image",
      });
      return;
    }

    if (url.pathname === "/api/media/assets" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        cloudinary_id: string;
        secure_url: string;
        resource_type: string;
      };
      const asset: MemoryAsset = {
        id: `asset-${assets.length + 1}`,
        cloudinaryId: body.cloudinary_id,
        secureUrl: body.secure_url,
        resourceType: body.resource_type,
        createdAt: new Date().toISOString(),
      };
      assets.unshift(asset);
      await fulfillJson(route, 201, { asset });
      return;
    }

    if (url.pathname === "/api/flow-3/cards/generate" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        partner_profile_id: string;
        template_id: string;
        message_text: string;
      };
      const card: CardItem = {
        id: `card-${cards.length + 1}`,
        status: "QUEUED",
        previewUrl: null,
        errorMessage: null,
        templateId: body.template_id,
        messageText: body.message_text,
        createdAt: new Date().toISOString(),
        partnerProfileId: body.partner_profile_id,
      };
      cards.unshift(card);
      await fulfillJson(route, 200, {
        card_id: card.id,
        status: card.status,
        preview_url: card.previewUrl,
      });
      return;
    }

    if (url.pathname.startsWith("/api/flow-3/cards/") && request.method() === "GET") {
      const cardId = url.pathname.split("/").pop() ?? "";
      const card = cards.find((item) => item.id === cardId);
      if (!card) {
        await fulfillJson(route, 404, {
          error: "card_id not found for current user",
          code: "VALIDATION_ERROR",
          retryable: false,
        });
        return;
      }
      card.status = "READY";
      card.previewUrl = "https://example.com/cards/card-1.jpg";
      await fulfillJson(route, 200, {
        card_id: card.id,
        status: card.status,
        preview_url: card.previewUrl,
        error_message: null,
      });
      return;
    }

    await route.continue();
  });
}

test("flow3 happy path with direct upload and card generation", async ({ page }) => {
  await mockFlow3HappyPath(page);

  await page.goto("/flow-3");

  await page.getByTestId("flow3-auth-name").fill("Flow3 User");
  await page.getByTestId("flow3-auth-email").fill("flow3@example.com");
  await page.getByTestId("flow3-auth-password").fill("password123");
  await page.getByTestId("flow3-auth-register").click();

  await expect(page.getByTestId("flow3-partner-panel")).toBeVisible();
  await page.getByTestId("flow3-profile-name").fill("Ava");
  await page.getByTestId("flow3-profile-interests").fill("music,dinner");
  await page.getByTestId("flow3-profile-create").click();
  await page.getByTestId("flow3-profile-continue").click();

  await expect(page.getByTestId("flow3-media-panel")).toBeVisible();
  await page.getByTestId("flow3-direct-file").setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake-image"),
  });
  await page.getByTestId("flow3-direct-upload").click();
  await expect(page.getByTestId("flow3-assets-list")).toBeVisible();
  await page.getByTestId("flow3-media-continue").click();

  await expect(page.getByTestId("flow3-card-panel")).toBeVisible();
  await page.getByTestId("flow3-card-submit").click();

  await expect(page.getByTestId("flow3-result-panel")).toBeVisible();
  await expect(page.getByTestId("flow3-result-preview")).toBeVisible();
  await expect(page.getByTestId("flow3-history-cards")).toBeVisible();
  await expect(page.getByTestId("flow3-history-assets")).toBeVisible();
});
