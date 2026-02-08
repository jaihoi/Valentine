import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/providers/vapi");
  vi.doUnmock("@/lib/api/guards");
  vi.doUnmock("@/lib/telemetry");
  vi.doUnmock("@/lib/logger");
});

describe("POST /api/webhooks/vapi", () => {
  it("rejects non-json content type", async () => {
    vi.doMock("@/lib/providers/vapi", () => ({
      verifyVapiWebhook: vi.fn(() => true),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        webhookEvent: { create: vi.fn() },
        voiceSession: { findMany: vi.fn(async () => []), update: vi.fn() },
      },
    }));
    vi.doMock("@/lib/api/guards", () => ({
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/vapi", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
        },
        body: "hello",
      }) as never,
    );

    expect(response.status).toBe(415);
  });

  it("rejects oversized payloads", async () => {
    vi.doMock("@/lib/providers/vapi", () => ({
      verifyVapiWebhook: vi.fn(() => true),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        webhookEvent: { create: vi.fn() },
        voiceSession: { findMany: vi.fn(async () => []), update: vi.fn() },
      },
    }));
    vi.doMock("@/lib/api/guards", () => ({
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/vapi", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(300 * 1024),
        },
        body: JSON.stringify({ id: "evt-1" }),
      }) as never,
    );

    expect(response.status).toBe(413);
  });

  it("returns duplicate ack when event id has already been processed", async () => {
    vi.doMock("@/lib/providers/vapi", () => ({
      verifyVapiWebhook: vi.fn(() => true),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        webhookEvent: {
          create: vi.fn(async () => {
            throw new Error("duplicate");
          }),
        },
        voiceSession: { findMany: vi.fn(async () => []), update: vi.fn() },
      },
    }));
    vi.doMock("@/lib/api/guards", () => ({
      trackUsage: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/webhooks/vapi", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vapi-signature": "sig",
        },
        body: JSON.stringify({
          id: "evt-duplicate",
          type: "call-started",
          callId: "provider-session-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true });
  });
});
