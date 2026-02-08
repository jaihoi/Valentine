import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/api/guards");
  vi.doUnmock("@/lib/telemetry");
});

describe("GET /api/history/flow-5", () => {
  it("returns AUTH_REQUIRED when user is not signed in", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: { findMany: vi.fn() },
        giftRecommendation: { findMany: vi.fn() },
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
      new Request("http://localhost/api/history/flow-5") as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  it("prioritizes flow5-tagged gifts in response ordering", async () => {
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
              id: "cm0p4kqsf0000a0i7sd8udxv9",
              userId: "user-1",
              name: "Mia",
              interests: ["music", "travel"],
              notes: null,
              createdAt: new Date("2026-02-08T00:00:00.000Z"),
              updatedAt: new Date("2026-02-08T00:00:00.000Z"),
            },
          ]),
        },
        giftRecommendation: {
          findMany: vi.fn(async () => [
            {
              id: "cm0p4kqsf0001a0i7sd8udxv1",
              userId: "user-1",
              partnerProfileId: "cm0p4kqsf0000a0i7sd8udxv9",
              interests: ["music"],
              budget: 80,
              constraints: null,
              recommendations: [],
              explanation: "legacy",
              links: ["https://example.com/legacy"],
              providerMeta: { flow: "legacy-gifts" },
              createdAt: new Date("2026-02-08T00:02:00.000Z"),
            },
            {
              id: "cm0p4kqsf0002a0i7sd8udxv2",
              userId: "user-1",
              partnerProfileId: "cm0p4kqsf0000a0i7sd8udxv9",
              interests: ["music"],
              budget: 120,
              constraints: null,
              recommendations: [],
              explanation: "flow5",
              links: ["https://example.com/flow5"],
              providerMeta: { flow: "flow5" },
              createdAt: new Date("2026-02-08T00:01:00.000Z"),
            },
          ]),
        },
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
      new Request("http://localhost/api/history/flow-5") as never,
    );
    const json = (await response.json()) as {
      gift_recommendations: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(json.gift_recommendations).toHaveLength(2);
    expect(json.gift_recommendations[0]?.id).toBe("cm0p4kqsf0002a0i7sd8udxv2");
  });
});
