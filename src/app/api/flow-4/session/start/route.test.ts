import { afterEach, describe, expect, it, vi } from "vitest";

function buildRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/flow-4/session/start", {
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
  vi.doUnmock("@/lib/telemetry");
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/providers/vapi");
});

describe("POST /api/flow-4/session/start", () => {
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
        voiceSession: { create: vi.fn() },
      },
    }));
    vi.doMock("@/lib/providers/vapi", () => ({
      startVapiSessionStrict: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        partner_profile_id: "ck1234567890123456789012",
        scenario: "Start a calm romantic call.",
      }) as never,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_REQUIRED",
      retryable: false,
    });
  });

  it("returns PARTNER_PROFILE_REQUIRED when partner is not owned by user", async () => {
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
        voiceSession: { create: vi.fn() },
      },
    }));
    vi.doMock("@/lib/providers/vapi", () => ({
      startVapiSessionStrict: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        partner_profile_id: "ck1234567890123456789012",
        scenario: "Start a calm romantic call.",
      }) as never,
    );

    expect(findFirst).toHaveBeenCalledOnce();
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: "PARTNER_PROFILE_REQUIRED",
      retryable: false,
    });
  });

  it("persists and returns strict session payload on success", async () => {
    const findFirst = vi.fn(async () => ({
      id: "partner-1",
      userId: "user-1",
      name: "Mia",
      interests: [],
      createdAt: new Date("2026-02-08T00:00:00.000Z"),
      updatedAt: new Date("2026-02-08T00:00:00.000Z"),
    }));
    const create = vi.fn(async () => ({
      id: "session-1",
      userId: "user-1",
      partnerProfileId: "ck1234567890123456789012",
      scenario: "Plan a cozy web call with thoughtful prompts.",
      providerSessionId: "provider-session-1",
      callLinkOrNumber: "https://vapi.ai/call/session-1",
      status: "CREATED",
      providerMeta: { flow: "flow4", source: "vapi" },
      createdAt: new Date("2026-02-08T00:00:00.000Z"),
      updatedAt: new Date("2026-02-08T00:00:00.000Z"),
    }));
    const startVapiSessionStrict = vi.fn(async () => ({
      providerSessionId: "provider-session-1",
      callLinkOrNumber: "https://vapi.ai/call/session-1",
      providerMeta: { source: "vapi" },
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
        partnerProfile: { findFirst },
        voiceSession: { create },
      },
    }));
    vi.doMock("@/lib/providers/vapi", () => ({
      startVapiSessionStrict,
    }));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        partner_profile_id: "ck1234567890123456789012",
        scenario: "Plan a cozy web call with thoughtful prompts.",
      }) as never,
    );

    expect(startVapiSessionStrict).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: expect.objectContaining({
        userId: "user-1",
        partnerProfileId: "ck1234567890123456789012",
        status: "CREATED",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      session_id: "session-1",
      call_link_or_number: "https://vapi.ai/call/session-1",
      status: "CREATED",
    });
  });

  it("maps strict provider FlowError to typed API response", async () => {
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
            id: "partner-1",
            userId: "user-1",
            name: "Mia",
          })),
        },
        voiceSession: { create: vi.fn() },
      },
    }));
    vi.doMock("@/lib/providers/vapi", async () => {
      const { FlowError } = await import("@/lib/flow-errors");
      return {
        startVapiSessionStrict: vi.fn(async () => {
          throw new FlowError("Timed out", {
            code: "PROVIDER_TIMEOUT",
            status: 504,
            retryable: true,
            provider: "vapi",
          });
        }),
      };
    });

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        partner_profile_id: "ck1234567890123456789012",
        scenario: "Plan a cozy web call with thoughtful prompts.",
      }) as never,
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
      provider: "vapi",
    });
  });

  it("replays response with same idempotency key and avoids duplicate provider calls", async () => {
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

    const create = vi.fn(async () => ({
      id: "session-1",
      userId: "user-1",
      partnerProfileId: "ck1234567890123456789012",
      scenario: "Plan a cozy web call with thoughtful prompts.",
      providerSessionId: "provider-session-1",
      callLinkOrNumber: "https://vapi.ai/call/session-1",
      status: "CREATED",
      providerMeta: { flow: "flow4", source: "vapi" },
      createdAt: new Date("2026-02-08T00:00:00.000Z"),
      updatedAt: new Date("2026-02-08T00:00:00.000Z"),
    }));
    const startVapiSessionStrict = vi.fn(async () => ({
      providerSessionId: "provider-session-1",
      callLinkOrNumber: "https://vapi.ai/call/session-1",
      providerMeta: { source: "vapi" },
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
            id: "partner-1",
            userId: "user-1",
            name: "Mia",
          })),
        },
        voiceSession: { create },
        idempotencyRecord: {
          findUnique: findRecord,
          delete: vi.fn(async () => undefined),
          upsert: upsertRecord,
        },
      },
    }));
    vi.doMock("@/lib/providers/vapi", () => ({
      startVapiSessionStrict,
    }));

    const { POST } = await import("./route");
    const body = {
      partner_profile_id: "ck1234567890123456789012",
      scenario: "Plan a cozy web call with thoughtful prompts.",
    };

    const first = await POST(
      buildRequest(body, { "Idempotency-Key": "flow4-same-key" }) as never,
    );
    const second = await POST(
      buildRequest(body, { "Idempotency-Key": "flow4-same-key" }) as never,
    );

    expect(startVapiSessionStrict).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(first.headers.get("Idempotency-Replayed")).toBe("false");
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(second.json()).resolves.toMatchObject({
      session_id: "session-1",
    });
  });
});
