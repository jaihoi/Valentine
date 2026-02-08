import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/health");
  vi.doUnmock("@/lib/telemetry");
});

describe("GET /api/health/ready", () => {
  it("returns 200 when readiness checks pass", async () => {
    vi.doMock("@/lib/health", () => ({
      evaluateReadiness: vi.fn(async () => ({
        status: "ready",
        checks: {
          database: "ok",
          redis: "ok",
          queue: "ok",
        },
        timestamp: "2026-02-08T00:00:00.000Z",
      })),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent: vi.fn(async () => undefined),
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/health/ready") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      checks: {
        database: "ok",
        redis: "ok",
        queue: "ok",
      },
    });
  });

  it("returns 503 and emits healthcheck event when not ready", async () => {
    const trackEvent = vi.fn(async () => undefined);
    vi.doMock("@/lib/health", () => ({
      evaluateReadiness: vi.fn(async () => ({
        status: "not_ready",
        checks: {
          database: "ok",
          redis: "fail",
          queue: "fail",
        },
        timestamp: "2026-02-08T00:00:00.000Z",
      })),
    }));
    vi.doMock("@/lib/telemetry", () => ({
      trackEvent,
    }));

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/health/ready") as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
    });
    expect(trackEvent).toHaveBeenCalledWith(
      "system",
      "DEPLOY_HEALTHCHECK_FAILED",
      expect.any(Object),
    );
  });
});
