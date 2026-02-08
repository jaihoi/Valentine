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

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function mockFlow3Failure(page: Page) {
  let isAuthenticated = false;
  let cardSubmitAttempts = 0;
  const userId = "user-flow3-failure";
  const partnerProfiles: PartnerProfile[] = [];
  const assets: MemoryAsset[] = [
    {
      id: "asset-1",
      cloudinaryId: "valentine/user-a/memory-assets/pic-1",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/pic-1.jpg",
      resourceType: "image",
      createdAt: new Date().toISOString(),
    },
  ];

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
        user: { id: userId, email: "failure@example.com", name: "Failure User" },
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      isAuthenticated = true;
      await fulfillJson(route, 200, {
        user: { id: userId, email: "failure@example.com", name: "Failure User" },
      });
      return;
    }

    if (url.pathname === "/api/history/flow-3" && request.method() === "GET") {
      await fulfillJson(route, 200, {
        partner_profiles: partnerProfiles,
        memory_assets: assets,
        cards: [],
      });
      return;
    }

    if (url.pathname === "/api/partner-profile" && request.method() === "POST") {
      const profile: PartnerProfile = {
        id: "profile-failure-1",
        name: "Luna",
        interests: ["music"],
      };
      partnerProfiles.unshift(profile);
      await fulfillJson(route, 200, { profile });
      return;
    }

    if (url.pathname === "/api/flow-3/cards/generate" && request.method() === "POST") {
      cardSubmitAttempts += 1;
      if (cardSubmitAttempts === 1) {
        await fulfillJson(route, 504, {
          error: "Generation timed out",
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          provider: "queue",
        });
        return;
      }
      await fulfillJson(route, 200, {
        card_id: "card-failure-1",
        status: "QUEUED",
        preview_url: null,
      });
      return;
    }

    if (url.pathname.startsWith("/api/flow-3/cards/") && request.method() === "GET") {
      await fulfillJson(route, 200, {
        card_id: "card-failure-1",
        status: "FAILED",
        preview_url: null,
        error_message: "PROVIDER_ENRICHMENT_FAILED: Cloudinary rendering failed",
      });
      return;
    }

    await route.continue();
  });
}

test("flow3 provider failure shows typed error and retry path", async ({ page }) => {
  await mockFlow3Failure(page);

  await page.goto("/flow-3");
  await page.getByTestId("flow3-auth-name").fill("Failure User");
  await page.getByTestId("flow3-auth-email").fill("failure@example.com");
  await page.getByTestId("flow3-auth-password").fill("password123");
  await page.getByTestId("flow3-auth-register").click();

  await page.getByTestId("flow3-profile-name").fill("Luna");
  await page.getByTestId("flow3-profile-interests").fill("music,dinner");
  await page.getByTestId("flow3-profile-create").click();
  await page.getByTestId("flow3-profile-continue").click();

  await expect(page.getByTestId("flow3-assets-list")).toBeVisible();
  await page.getByTestId("flow3-asset-checkbox-asset-1").check();
  await page.getByTestId("flow3-media-continue").click();

  await page.getByTestId("flow3-card-submit").click();
  await expect(page.getByTestId("flow3-error-panel")).toBeVisible();
  await expect(page.getByTestId("flow3-error-panel")).toBeFocused();
  await expect(page.getByText("PROVIDER_TIMEOUT")).toBeVisible();
  await expect(page.getByTestId("flow3-error-retry")).toBeVisible();

  await page.getByTestId("flow3-error-retry").click();
  await expect(page.getByTestId("flow3-result-panel")).toBeVisible();
  await expect(page.getByTestId("flow3-result-error")).toContainText(
    "PROVIDER_ENRICHMENT_FAILED",
  );
});
