import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "./health";

describe("health readiness evaluation", () => {
  it("returns ready when database, redis, and queue are healthy", async () => {
    const readiness = await evaluateReadiness({
      checkDatabase: async () => true,
      checkRedis: async () => true,
      isQueueConfigured: () => true,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.checks).toEqual({
      database: "ok",
      redis: "ok",
      queue: "ok",
    });
  });

  it("returns not_ready when database fails", async () => {
    const readiness = await evaluateReadiness({
      checkDatabase: async () => false,
      checkRedis: async () => true,
      isQueueConfigured: () => true,
    });

    expect(readiness.status).toBe("not_ready");
    expect(readiness.checks.database).toBe("fail");
    expect(readiness.checks.redis).toBe("ok");
    expect(readiness.checks.queue).toBe("ok");
  });

  it("returns not_ready when redis/queue are unavailable", async () => {
    const readiness = await evaluateReadiness({
      checkDatabase: async () => true,
      checkRedis: async () => false,
      isQueueConfigured: () => false,
    });

    expect(readiness.status).toBe("not_ready");
    expect(readiness.checks).toEqual({
      database: "ok",
      redis: "fail",
      queue: "fail",
    });
  });
});
