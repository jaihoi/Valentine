import { expect, test } from "@playwright/test";

test("api responses include x-request-id header", async ({ request }) => {
  test.setTimeout(120_000);
  const response = await request.get("/api/health/live");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["x-request-id"]).toBeTruthy();
});
