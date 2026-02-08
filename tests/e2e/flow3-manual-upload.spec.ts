import { expect, test, type Page, type Route } from "@playwright/test";

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
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

async function mockFlow3ManualPath(page: Page) {
  let isAuthenticated = false;
  const userId = "user-flow3-manual";
  const partnerProfiles: PartnerProfile[] = [];
  const assets: MemoryAsset[] = [];
  const cards: CardItem[] = [];

  await page.route("**/api/**", async (route) => {
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
        user: { id: userId, email: "manual@example.com", name: "Manual User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: "manual@example.com", name: "Manual User" },
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
        id: "profile-manual-1",
        name: body.name ?? "Partner",
        interests: body.interests ?? [],
      };
      partnerProfiles.unshift(profile);
      await fulfillJson(route, 200, { profile });
      return;
    }

    if (url.pathname === "/api/media/assets" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        cloudinary_id: string;
        secure_url: string;
        resource_type: string;
      };
      const asset: MemoryAsset = {
        id: `asset-manual-${assets.length + 1}`,
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
        id: "card-manual-1",
        status: "QUEUED",
        previewUrl: null,
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
      cards[0]!.status = "READY";
      cards[0]!.previewUrl = "https://example.com/cards/manual.jpg";
      await fulfillJson(route, 200, {
        card_id: cards[0]!.id,
        status: cards[0]!.status,
        preview_url: cards[0]!.previewUrl,
        error_message: null,
      });
      return;
    }

    await route.continue();
  });
}

test("flow3 supports manual asset registration fallback", async ({ page }) => {
  await mockFlow3ManualPath(page);

  await page.goto("/flow-3");
  await page.getByTestId("flow3-auth-name").fill("Manual User");
  await page.getByTestId("flow3-auth-email").fill("manual@example.com");
  await page.getByTestId("flow3-auth-password").fill("password123");
  await page.getByTestId("flow3-auth-register").click();

  await page.getByTestId("flow3-profile-name").fill("Mia");
  await page.getByTestId("flow3-profile-interests").fill("travel,music");
  await page.getByTestId("flow3-profile-create").click();
  await page.getByTestId("flow3-profile-continue").click();

  await expect(page.getByTestId("flow3-media-panel")).toBeVisible();
  await page.getByTestId("flow3-manual-cloudinary-id").fill("valentine/user-a/memory-assets/pic");
  await page.getByTestId("flow3-manual-secure-url").fill("https://res.cloudinary.com/demo/image/upload/pic.jpg");
  await page.getByTestId("flow3-manual-resource-type").selectOption("image");
  await page.getByTestId("flow3-manual-register").click();
  await page.getByTestId("flow3-media-continue").click();

  await expect(page.getByTestId("flow3-card-panel")).toBeVisible();
  await page.getByTestId("flow3-card-submit").click();

  await expect(page.getByTestId("flow3-result-panel")).toBeVisible();
  await expect(page.getByTestId("flow3-result-preview")).toBeVisible();
});
