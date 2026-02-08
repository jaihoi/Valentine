import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/providers/cloudinary");
  vi.doUnmock("@/lib/logger");
});

describe("POST /api/webhooks/cloudinary", () => {
  it("rejects non-json content type", async () => {
    vi.doMock("@/lib/providers/cloudinary", () => ({
      verifyCloudinaryWebhook: vi.fn(() => true),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        webhookEvent: { create: vi.fn() },
        memoryAsset: { findFirst: vi.fn(), create: vi.fn() },
      },
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
      new Request("http://localhost/api/webhooks/cloudinary", {
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
    vi.doMock("@/lib/providers/cloudinary", () => ({
      verifyCloudinaryWebhook: vi.fn(() => true),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        webhookEvent: { create: vi.fn() },
        memoryAsset: { findFirst: vi.fn(), create: vi.fn() },
      },
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
      new Request("http://localhost/api/webhooks/cloudinary", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(300 * 1024),
        },
        body: JSON.stringify({ public_id: "abc" }),
      }) as never,
    );

    expect(response.status).toBe(413);
  });

  it("returns duplicate ack when event id is already processed", async () => {
    vi.doMock("@/lib/providers/cloudinary", () => ({
      verifyCloudinaryWebhook: vi.fn(() => true),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        webhookEvent: {
          create: vi.fn(async () => {
            throw new Error("duplicate");
          }),
        },
        memoryAsset: { findFirst: vi.fn(), create: vi.fn() },
      },
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
      new Request("http://localhost/api/webhooks/cloudinary", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cld-signature": "sig",
        },
        body: JSON.stringify({
          notification_id: "evt-duplicate",
          public_id: "sample",
          secure_url: "https://example.com/sample.jpg",
          folder: "valentine/user-cm0p4kqsf0000a0i7sd8udxv9/memory-assets",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true });
  });
});
