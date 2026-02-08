import IORedis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const RATE_LIMIT_PREFIX = "rate-limit";
const REDIS_RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

let redisClient: IORedis | null | undefined;
let loggedRedisFallback = false;
let loggedRedisUnavailable = false;

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
  key: string;
};

type RateLimitFailureReason = "limit_exceeded" | "limiter_unavailable";
type RateLimitBackend = "redis" | "memory" | "unavailable";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  backend: RateLimitBackend;
  reason?: RateLimitFailureReason;
};

function checkRateLimitMemory(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(config.key);

  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + config.windowMs;
    buckets.set(config.key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, config.limit - 1),
      resetAt,
      backend: "memory",
    };
  }

  if (bucket.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      backend: "memory",
      reason: "limit_exceeded",
    };
  }

  bucket.count += 1;
  buckets.set(config.key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, config.limit - bucket.count),
    resetAt: bucket.resetAt,
    backend: "memory",
  };
}

function getRedisClient(): IORedis | null {
  if (redisClient !== undefined) return redisClient;
  if (!env.REDIS_URL) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  return redisClient;
}

function buildUnavailableResult(config: RateLimitConfig): RateLimitResult {
  return {
    allowed: false,
    remaining: 0,
    resetAt: Date.now() + config.windowMs,
    backend: "unavailable",
    reason: "limiter_unavailable",
  };
}

async function checkRateLimitRedis(config: RateLimitConfig) {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const redisKey = `${RATE_LIMIT_PREFIX}:${config.key}`;
    const result = (await client.eval(
      REDIS_RATE_LIMIT_SCRIPT,
      1,
      redisKey,
      String(config.windowMs),
    )) as [number | string, number | string];

    const count = Number(result?.[0] ?? 0);
    const ttlMsRaw = Number(result?.[1] ?? config.windowMs);
    const ttlMs = ttlMsRaw > 0 ? ttlMsRaw : config.windowMs;
    const resetAt = Date.now() + ttlMs;

    if (count > config.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        backend: "redis" as const,
        reason: "limit_exceeded" as const,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, config.limit - count),
      resetAt,
      backend: "redis" as const,
    };
  } catch (error) {
    if (!loggedRedisUnavailable) {
      logger.error(
        { error: String(error) },
        "Redis rate limiter unavailable, evaluating fallback policy",
      );
      loggedRedisUnavailable = true;
    }
    return null;
  }
}

function shouldAllowMemoryFallback(): boolean {
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

export async function checkRateLimit(
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const redisResult = await checkRateLimitRedis(config);
  if (redisResult) {
    return redisResult;
  }

  if (shouldAllowMemoryFallback()) {
    if (!loggedRedisFallback && env.REDIS_URL) {
      logger.warn(
        "Using in-memory rate limiting fallback. Configure Redis for durable limits.",
      );
      loggedRedisFallback = true;
    }
    return checkRateLimitMemory(config);
  }

  return buildUnavailableResult(config);
}

export function clearRateLimits(): void {
  buckets.clear();
}
