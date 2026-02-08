import { afterEach, describe, expect, it, vi } from "vitest";

type RequestContext = {
  params: Promise<{ sessionId: string }>;
};

function buildContext(sessionId: string): RequestContext {
  return {
    params: Promise.resolve({ sessionId }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GET /api/flow-4/session/[sessionId]", () => {
  it("returns AUTH_REQUIRED when user is not signed in", { timeout: 15_000 }, async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        voiceSession: { findFirst: vi.fn() },
      },
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/flow-4/session/session-1") as never,
      buildContext("session-1"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  it("returns not found when session is missing or not tagged as flow4", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user-1",
        email: "user@example.com",
        name: "User",
      })),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        voiceSession: {
          findFirst: vi.fn(async () => ({
            id: "session-1",
            userId: "user-1",
            status: "ACTIVE",
            callLinkOrNumber: "https://vapi.ai/call/session-1",
            providerMeta: { flow: "legacy" },
            updatedAt: new Date("2026-02-08T00:00:00.000Z"),
          })),
        },
      },
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/flow-4/session/session-1") as never,
      buildContext("session-1"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      retryable: false,
    });
  });

  it("returns user-scoped flow4 session status payload", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user-1",
        email: "user@example.com",
        name: "User",
      })),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        voiceSession: {
          findFirst: vi.fn(async () => ({
            id: "session-1",
            userId: "user-1",
            status: "COMPLETED",
            callLinkOrNumber: "https://vapi.ai/call/session-1",
            providerMeta: { flow: "flow4", providerSessionId: "provider-1" },
            updatedAt: new Date("2026-02-08T00:00:00.000Z"),
          })),
        },
      },
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/flow-4/session/session-1") as never,
      buildContext("session-1"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      session_id: "session-1",
      call_link_or_number: "https://vapi.ai/call/session-1",
      status: "COMPLETED",
      provider_meta: {
        flow: "flow4",
      },
    });
  });
});
