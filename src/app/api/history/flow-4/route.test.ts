import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GET /api/history/flow-4", () => {
  it("returns AUTH_REQUIRED when user is not signed in", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: { findMany: vi.fn() },
        voiceSession: { findMany: vi.fn() },
      },
    }));
    vi.doMock("@/lib/api/guards", () => ({
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/history/flow-4") as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  it("returns only flow4-scoped sessions with partner profiles", async () => {
    const trackUsage = vi.fn(async () => undefined);
    const trackEvent = vi.fn(async () => undefined);

    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user-1",
        email: "user@example.com",
        name: "User",
      })),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: {
          findMany: vi.fn(async () => [
            {
              id: "partner-1",
              userId: "user-1",
              name: "Mia",
              interests: ["music", "travel"],
              notes: null,
              createdAt: new Date("2026-02-08T00:00:00.000Z"),
              updatedAt: new Date("2026-02-08T00:00:00.000Z"),
            },
          ]),
        },
        voiceSession: {
          findMany: vi.fn(async () => [
            {
              id: "session-flow4",
              userId: "user-1",
              partnerProfileId: "partner-1",
              scenario: "Flow 4 scenario",
              callLinkOrNumber: "https://vapi.ai/call/session-flow4",
              status: "ACTIVE",
              providerMeta: { flow: "flow4" },
              createdAt: new Date("2026-02-08T00:00:00.000Z"),
              updatedAt: new Date("2026-02-08T00:01:00.000Z"),
            },
            {
              id: "session-other",
              userId: "user-1",
              partnerProfileId: "partner-1",
              scenario: "Legacy session",
              callLinkOrNumber: "https://vapi.ai/call/session-other",
              status: "COMPLETED",
              providerMeta: { flow: "flow2" },
              createdAt: new Date("2026-02-08T00:00:00.000Z"),
              updatedAt: new Date("2026-02-08T00:02:00.000Z"),
            },
          ]),
        },
      },
    }));
    vi.doMock("@/lib/api/guards", () => ({
      trackUsage,
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent,
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/history/flow-4") as never,
    );
    const json = (await response.json()) as {
      partner_profiles: Array<{ id: string }>;
      voice_sessions: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(json.partner_profiles).toHaveLength(1);
    expect(json.voice_sessions).toHaveLength(1);
    expect(json.voice_sessions[0]?.id).toBe("session-flow4");
    expect(trackUsage).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledOnce();
  });
});
