import IORedis from "ioredis";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

export type HealthCheckStatus = "ok" | "fail";

export type ReadinessChecks = {
  database: HealthCheckStatus;
  redis: HealthCheckStatus;
  queue: HealthCheckStatus;
};

export type ReadinessStatus = "ready" | "not_ready";

export type ReadinessResult = {
  status: ReadinessStatus;
  checks: ReadinessChecks;
  timestamp: string;
};

type ReadinessDependencies = {
  checkDatabase: () => Promise<boolean>;
  checkRedis: () => Promise<boolean>;
  isQueueConfigured: () => boolean;
};

async function checkDatabaseDefault(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedisDefault(): Promise<boolean> {
  if (!env.REDIS_URL) return false;

  const redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  try {
    const pong = await redis.ping();
    return pong.toUpperCase() === "PONG";
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}

function isQueueConfiguredDefault(): boolean {
  return Boolean(env.REDIS_URL);
}

const defaultDependencies: ReadinessDependencies = {
  checkDatabase: checkDatabaseDefault,
  checkRedis: checkRedisDefault,
  isQueueConfigured: isQueueConfiguredDefault,
};

export async function evaluateReadiness(
  dependencies: ReadinessDependencies = defaultDependencies,
): Promise<ReadinessResult> {
  const [databaseOk, redisOk] = await Promise.all([
    dependencies.checkDatabase(),
    dependencies.checkRedis(),
  ]);

  const queueConfigured = dependencies.isQueueConfigured();
  const checks: ReadinessChecks = {
    database: databaseOk ? "ok" : "fail",
    redis: redisOk ? "ok" : "fail",
    queue: queueConfigured && redisOk ? "ok" : "fail",
  };

  const status: ReadinessStatus =
    checks.database === "ok" && checks.redis === "ok" && checks.queue === "ok"
      ? "ready"
      : "not_ready";

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}
