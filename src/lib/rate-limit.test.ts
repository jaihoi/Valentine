import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("ioredis");
  vi.doUnmock("@/lib/env");
  vi.doUnmock("@/lib/logger");
});

describe("rate limiter", () => {
  it("falls back to in-memory limiter in test when redis is missing", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        NODE_ENV: "test",
        REDIS_URL: undefined,
      },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { checkRateLimit, clearRateLimits } = await import("./rate-limit");
    clearRateLimits();

    const first = await checkRateLimit({
      key: "test-user",
      limit: 2,
      windowMs: 60_000,
    });
    const second = await checkRateLimit({
      key: "test-user",
      limit: 2,
      windowMs: 60_000,
    });
    const third = await checkRateLimit({
      key: "test-user",
      limit: 2,
      windowMs: 60_000,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe("limit_exceeded");
    expect(third.backend).toBe("memory");
  });

  it("fails closed in production when redis is not configured", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        NODE_ENV: "production",
        REDIS_URL: undefined,
      },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit({
      key: "prod-user",
      limit: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("limiter_unavailable");
    expect(result.backend).toBe("unavailable");
  });

  it("uses redis limiter when configured", async () => {
    const evalMock = vi.fn(async () => [1, 5000]);
    const onMock = vi.fn();
    const ctorSpy = vi.fn();
    class RedisMock {
      constructor(url: string, options: unknown) {
        ctorSpy(url, options);
      }
      eval = evalMock;
      on = onMock;
    }

    vi.doMock("ioredis", () => ({
      default: RedisMock,
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        NODE_ENV: "production",
        REDIS_URL: "redis://localhost:6379",
      },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit({
      key: "redis-user",
      limit: 3,
      windowMs: 60_000,
    });

    expect(ctorSpy).toHaveBeenCalledOnce();
    expect(evalMock).toHaveBeenCalledOnce();
    expect(result.allowed).toBe(true);
    expect(result.backend).toBe("redis");
  });

  it("falls back to memory in development if redis calls fail", async () => {
    const evalMock = vi.fn(async () => {
      throw new Error("redis down");
    });
    const ctorSpy = vi.fn();
    class RedisMock {
      constructor(url: string, options: unknown) {
        ctorSpy(url, options);
      }
      eval = evalMock;
      on = vi.fn();
    }

    vi.doMock("ioredis", () => ({
      default: RedisMock,
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        NODE_ENV: "development",
        REDIS_URL: "redis://localhost:6379",
      },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit({
      key: "dev-user",
      limit: 3,
      windowMs: 60_000,
    });

    expect(ctorSpy).toHaveBeenCalledOnce();
    expect(evalMock).toHaveBeenCalledOnce();
    expect(result.allowed).toBe(true);
    expect(result.backend).toBe("memory");
  });
});
