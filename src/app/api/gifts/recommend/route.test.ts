import { afterEach, describe, expect, it, vi } from "vitest";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/gifts/recommend", {
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
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/api/guards");
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/flow5/gift-service");
  vi.doUnmock("@/lib/telemetry");
});

describe("POST /api/gifts/recommend", () => {
  it("returns strict typed errors when provider path fails", async () => {
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
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: { findFirst: vi.fn(async () => null) },
      },
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/flow5/gift-service", async () => {
      const { FlowError } = await import("@/lib/flow-errors");
      return {
        createStrictGiftRecommendation: vi.fn(async () => {
          throw new FlowError("Perplexity timed out", {
            code: "PROVIDER_TIMEOUT",
            status: 504,
            retryable: true,
            provider: "perplexity",
          });
        }),
      };
    });

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        interests: ["music"],
        budget: 100,
      }) as never,
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
      provider: "perplexity",
    });
  });

  it("keeps compatibility success shape while using strict service", async () => {
    const createStrictGiftRecommendation = vi.fn(async () => ({
      saved: {
        id: "cm0p4kqsf0003a0i7sd8udxv3",
      },
      gift: {
        recommendations: [
          {
            title: "Coffee Tasting Kit",
            reason: "Matches coffee interest.",
            estimated_price: 45,
          },
        ],
        explanation: "Best gift recommendation for this profile.",
        links: ["https://example.com/gift-kit"],
      },
      sources: {
        perplexity_links: ["https://example.com/gift-kit"],
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
    vi.doMock("@/lib/db", () => ({
      prisma: {
        partnerProfile: { findFirst: vi.fn(async () => null) },
      },
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/flow5/gift-service", () => ({
      createStrictGiftRecommendation,
    }));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        interests: ["coffee"],
        budget: 80,
        constraints: "no perfume",
      }) as never,
    );

    expect(createStrictGiftRecommendation).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      recommendations: [
        {
          title: "Coffee Tasting Kit",
          estimated_price: 45,
        },
      ],
      explanation: "Best gift recommendation for this profile.",
      links: ["https://example.com/gift-kit"],
    });
  });
});
