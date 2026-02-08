import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unmock("@/lib/network");
  vi.unmock("@/lib/env");
  global.fetch = originalFetch;
});

describe("vapi strict provider", () => {
  it("returns PROVIDER_CONFIG_MISSING when key is absent", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        VAPI_API_KEY: undefined,
        VAPI_WEBHOOK_SECRET: undefined,
      },
    }));

    const { startVapiSessionStrict } = await import("@/lib/providers/vapi");

    await expect(
      startVapiSessionStrict({
        userId: "u1",
        scenario: "romantic call scenario",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_CONFIG_MISSING",
      status: 503,
    });
  });

  it("returns PROVIDER_TIMEOUT on timeout errors", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        VAPI_API_KEY: "token",
        VAPI_WEBHOOK_SECRET: undefined,
      },
    }));
    vi.doMock("@/lib/network", () => {
      class TimeoutError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "RequestTimeoutError";
        }
      }
      return {
        RequestTimeoutError: TimeoutError,
        fetchWithTimeout: vi.fn(() => {
          throw new TimeoutError("Request timed out after 6000ms");
        }),
      };
    });

    const { startVapiSessionStrict } = await import("@/lib/providers/vapi");

    await expect(
      startVapiSessionStrict({
        userId: "u1",
        scenario: "romantic call scenario",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      status: 504,
    });
  });

  it("returns PROVIDER_ENRICHMENT_FAILED on malformed provider output", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        VAPI_API_KEY: "token",
        VAPI_WEBHOOK_SECRET: undefined,
      },
    }));
    vi.doMock("@/lib/network", async () => {
      const actual = await vi.importActual<typeof import("@/lib/network")>(
        "@/lib/network",
      );
      return {
        ...actual,
        fetchWithTimeout: vi.fn(async () => {
          return new Response(JSON.stringify({ id: "abc-no-call-url" }), {
            status: 200,
          });
        }),
      };
    });

    const { startVapiSessionStrict } = await import("@/lib/providers/vapi");

    await expect(
      startVapiSessionStrict({
        userId: "u1",
        scenario: "romantic call scenario",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ENRICHMENT_FAILED",
      status: 502,
    });
  });

  it("returns normalized strict session payload on success", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        VAPI_API_KEY: "token",
        VAPI_WEBHOOK_SECRET: undefined,
      },
    }));
    vi.doMock("@/lib/network", async () => {
      const actual = await vi.importActual<typeof import("@/lib/network")>(
        "@/lib/network",
      );
      return {
        ...actual,
        fetchWithTimeout: vi.fn(async () => {
          return new Response(
            JSON.stringify({
              id: "session-1",
              webCallUrl: "https://example.com/call/session-1",
            }),
            { status: 200 },
          );
        }),
      };
    });

    const { startVapiSessionStrict } = await import("@/lib/providers/vapi");
    const result = await startVapiSessionStrict({
      userId: "u1",
      scenario: "romantic call scenario",
      partnerName: "Mia",
    });

    expect(result.providerSessionId).toBe("session-1");
    expect(result.callLinkOrNumber).toBe("https://example.com/call/session-1");
    expect(result.providerMeta).toHaveProperty("webCallUrl");
  });
});
