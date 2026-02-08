import { afterEach, describe, expect, it, vi } from "vitest";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/api/guards");
});

describe("POST /api/auth/register", () => {
  it("enforces register rate limiting", { timeout: 15_000 }, async () => {
    vi.doMock("@/lib/api/guards", () => ({
      getRequestRateLimitIdentity: vi.fn(() => "127.0.0.1"),
      requireRateLimit: vi.fn(async () =>
        Response.json(
          {
            error: "Rate limit exceeded",
          },
          { status: 429 },
        ),
      ),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        name: "User",
        email: "user@example.com",
        password: "password123",
      }) as never,
    );

    expect(response.status).toBe(429);
  });
});
