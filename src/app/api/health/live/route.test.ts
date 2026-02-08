import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health/live", () => {
  it("returns liveness status", async () => {
    const response = await GET(
      new Request("http://localhost/api/health/live") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
    });
  });
});
