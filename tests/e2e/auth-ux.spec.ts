import { expect, test, type Route } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

test("register shows inline validation, password toggle, and API error summary", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      await fulfillJson(route, 401, {
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (url.pathname === "/api/auth/register" && request.method() === "POST") {
      await fulfillJson(route, 409, {
        error: "Email already registered",
        code: "VALIDATION_ERROR",
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/register");

  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-error-summary")).toContainText("Name is required.");
  await expect(page.getByTestId("auth-error-summary")).toContainText("Email is required.");
  await expect(page.getByTestId("auth-error-summary")).toContainText("Password is required.");

  await page.getByTestId("auth-name").fill("E2E User");
  await page.getByTestId("auth-email").fill("invalid-email");
  await page.getByTestId("auth-password").fill("12345");
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("auth-error-summary")).toContainText(
    "Enter a valid email address.",
  );
  await expect(page.getByTestId("auth-error-summary")).toContainText(
    "Password must be at least 8 characters.",
  );

  const passwordInput = page.getByTestId("auth-password");
  await expect(passwordInput).toHaveAttribute("type", "password");
  await page.getByTestId("auth-password-toggle").click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await page.getByTestId("auth-password-toggle").click();
  await expect(passwordInput).toHaveAttribute("type", "password");

  await page.getByTestId("auth-email").fill("user@example.com");
  await page.getByTestId("auth-password").fill("password123");
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("auth-error-summary")).toContainText(
    "Email already registered",
  );
});

test("login validates required fields and surfaces backend auth failures", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      await fulfillJson(route, 401, {
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (url.pathname === "/api/auth/login" && request.method() === "POST") {
      await fulfillJson(route, 401, {
        error: "Invalid email or password",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/login");

  await expect(page.getByTestId("auth-name")).toHaveCount(0);

  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-error-summary")).toContainText("Email is required.");
  await expect(page.getByTestId("auth-error-summary")).toContainText("Password is required.");

  await page.getByTestId("auth-email").fill("user@example.com");
  await page.getByTestId("auth-password").fill("password123");
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("auth-error-summary")).toContainText(
    "Invalid email or password",
  );
});

test.describe("mobile auth UX", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("register form remains accessible on mobile", async ({ page }) => {
    await page.route("**/api/auth/me", async (route) => {
      await fulfillJson(route, 401, {
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
      });
    });

    await page.goto("/register");

    await expect(page.getByTestId("auth-register-form")).toBeVisible();
    await expect(page.getByTestId("auth-submit")).toBeVisible();

    const overflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowPx).toBeLessThanOrEqual(1);
  });
});
