import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

const flow1Only = process.env.NEXT_PUBLIC_FLOW1_ONLY === "true";
const flow2Enabled = process.env.NEXT_PUBLIC_FLOW2_ENABLED === "true";
const flow3Enabled = process.env.NEXT_PUBLIC_FLOW3_ENABLED === "true";
const flow4Enabled = process.env.NEXT_PUBLIC_FLOW4_ENABLED === "true";
const flow5Enabled = process.env.NEXT_PUBLIC_FLOW5_ENABLED === "true";

const modules = [
  { id: "flow-1", cta: "Start Flow 1", enabled: true },
  { id: "flow-2", cta: "Start Flow 2", enabled: flow2Enabled },
  { id: "flow-3", cta: "Start Flow 3", enabled: flow3Enabled },
  { id: "flow-4", cta: "Start Flow 4", enabled: flow4Enabled },
  { id: "flow-5", cta: "Start Flow 5", enabled: flow5Enabled },
] as const;

test("home keeps primary onboarding CTA and flow chooser behavior", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Choose Your Flow" })).toBeVisible();
  await expect(page.getByText("How It Works")).toBeVisible();

  const ctaRow = page.getByTestId("home-primary-cta-row");
  await expect(ctaRow).toBeVisible();
  await expect(ctaRow.locator("a").nth(0)).toHaveText("Create Account");
  await expect(ctaRow.locator("a").nth(1)).toHaveText("Sign In");

  for (const flowModule of modules) {
    const visible = flow1Only ? flowModule.id === "flow-1" : flowModule.enabled;
    const card = page.getByTestId(`home-module-${flowModule.id}`);
    const link = page.getByRole("link", { name: flowModule.cta });

    if (visible) {
      await expect(card).toBeVisible();
      await expect(link).toBeVisible();
    } else {
      await expect(card).toHaveCount(0);
      await expect(link).toHaveCount(0);
    }
  }
});

test.describe("mobile home UX", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("home sections remain usable on small screens", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("home-primary-cta-row")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose Your Flow" })).toBeVisible();

    const overflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflowPx).toBeLessThanOrEqual(1);
  });
});
