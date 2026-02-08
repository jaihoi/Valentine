import { afterEach, describe, expect, it, vi } from "vitest";

function buildRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/flow-5/gifts/recommend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/api/guards");
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/flow5/gift-service");
  vi.doUnmock("@/lib/telemetry");
});

describe("POST /api/flow-5/gifts/recommend", () => {
  it("returns AUTH_REQUIRED when user is not signed in", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/api/guards", () => ({
      requireRateLimit: vi.fn(() => null),
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: { findFirst: vi.fn() },
      },
    }));
    vi.doMock("@/lib/flow5/gift-service", () => ({
      createStrictGiftRecommendation: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
        interests: ["music"],
        budget: 120,
      }) as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  it("returns PARTNER_PROFILE_REQUIRED when partner is not owned", async () => {
    const findFirst = vi.fn(async () => null);

    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user-1",
        email: "user@example.com",
        name: "User",
      })),
    }));
    vi.doMock("@/lib/api/guards", () => ({
      requireRateLimit: vi.fn(() => null),
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: { findFirst },
      },
    }));
    vi.doMock("@/lib/flow5/gift-service", () => ({
      createStrictGiftRecommendation: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
        interests: ["music"],
        budget: 120,
      }) as never,
    );

    expect(findFirst).toHaveBeenCalledOnce();
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "PARTNER_PROFILE_REQUIRED",
      retryable: false,
    });
  });

  it("persists strict result and returns flow5 response payload", async () => {
    const createStrictGiftRecommendation = vi.fn(async () => ({
      saved: {
        id: "cm0p4kqsf0001a0i7sd8udxv1",
      },
      gift: {
        recommendations: [
          {
            title: "Music Vinyl Set",
            reason: "Great for music date nights.",
            estimated_price: 70,
          },
        ],
        explanation: "Matched from interests and budget.",
        links: ["https://example.com/gift"],
      },
      sources: {
        perplexity_links: ["https://example.com/gift"],
        firecrawl_extracts_count: 1,
      },
    }));

    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user-1",
        email: "user@example.com",
        name: "User",
      })),
    }));
    vi.doMock("@/lib/api/guards", () => ({
      requireRateLimit: vi.fn(() => null),
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: {
          findFirst: vi.fn(async () => ({
            id: "cm0p4kqsf0000a0i7sd8udxv9",
            userId: "user-1",
            name: "Mia",
          })),
        },
      },
    }));
    vi.doMock("@/lib/flow5/gift-service", () => ({
      createStrictGiftRecommendation,
    }));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
        interests: ["music"],
        budget: 120,
        constraints: "no jewelry",
      }) as never,
    );

    expect(createStrictGiftRecommendation).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      gift_recommendation_id: "cm0p4kqsf0001a0i7sd8udxv1",
      explanation: "Matched from interests and budget.",
      sources: {
        firecrawl_extracts_count: 1,
      },
    });
  });

  it("maps moderation block to VALIDATION_ERROR", async () => {
    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user-1",
        email: "user@example.com",
        name: "User",
      })),
    }));
    vi.doMock("@/lib/api/guards", () => ({
      requireRateLimit: vi.fn(() => null),
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: {
          findFirst: vi.fn(async () => ({
            id: "cm0p4kqsf0000a0i7sd8udxv9",
            userId: "user-1",
            name: "Mia",
          })),
        },
      },
    }));
    vi.doMock("@/lib/flow5/gift-service", async () => {
      const { FlowError: SharedFlowError } = await import("@/lib/flow-errors");
      return {
        createStrictGiftRecommendation: vi.fn(async () => {
          throw new SharedFlowError("Generated content blocked by moderation", {
            code: "VALIDATION_ERROR",
            status: 422,
            retryable: false,
            provider: "moderation",
          });
        }),
      };
    });

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
        interests: ["music"],
        budget: 120,
      }) as never,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "VALIDATION_ERROR",
      retryable: false,
      provider: "moderation",
    });
  });

  it("replays same idempotency key without duplicate strict generation calls", async () => {
    const store = new Map<string, Record<string, unknown>>();
    const findRecord = vi.fn(async (args: { where: { userId_endpoint_keyHash: { userId: string; endpoint: string; keyHash: string } } }) => {
      const key = `${args.where.userId_endpoint_keyHash.userId}:${args.where.userId_endpoint_keyHash.endpoint}:${args.where.userId_endpoint_keyHash.keyHash}`;
      return store.get(key) ?? null;
    });
    const upsertRecord = vi.fn(async (args: {
      where: { userId_endpoint_keyHash: { userId: string; endpoint: string; keyHash: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const key = `${args.where.userId_endpoint_keyHash.userId}:${args.where.userId_endpoint_keyHash.endpoint}:${args.where.userId_endpoint_keyHash.keyHash}`;
      const existing = store.get(key);
      const next = existing
        ? { ...existing, ...args.update }
        : { id: "idem-1", ...args.create };
      store.set(key, next);
      return next;
    });

    const createStrictGiftRecommendation = vi.fn(async () => ({
      saved: { id: "gift-1" },
      gift: {
        recommendations: [
          {
            title: "Music Vinyl Set",
            reason: "Great for music date nights.",
            estimated_price: 70,
          },
        ],
        explanation: "Matched from interests and budget.",
        links: ["https://example.com/gift"],
      },
      sources: {
        perplexity_links: ["https://example.com/gift"],
        firecrawl_extracts_count: 1,
      },
    }));

    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: vi.fn(async () => ({
        id: "user-1",
        email: "user@example.com",
        name: "User",
      })),
    }));
    vi.doMock("@/lib/api/guards", () => ({
      requireRateLimit: vi.fn(() => null),
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: {
          findFirst: vi.fn(async () => ({
            id: "cm0p4kqsf0000a0i7sd8udxv9",
            userId: "user-1",
            name: "Mia",
          })),
        },
        idempotencyRecord: {
          findUnique: findRecord,
          delete: vi.fn(async () => undefined),
          upsert: upsertRecord,
        },
      },
    }));
    vi.doMock("@/lib/flow5/gift-service", () => ({
      createStrictGiftRecommendation,
    }));

    const { POST } = await import("./route");
    const body = {
      partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      interests: ["music"],
      budget: 120,
    };

    const first = await POST(
      buildRequest(body, { "Idempotency-Key": "flow5-same-key" }) as never,
    );
    const second = await POST(
      buildRequest(body, { "Idempotency-Key": "flow5-same-key" }) as never,
    );

    expect(createStrictGiftRecommendation).toHaveBeenCalledOnce();
    expect(first.headers.get("Idempotency-Replayed")).toBe("false");
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(second.json()).resolves.toMatchObject({
      gift_recommendation_id: "gift-1",
    });
  });
});
