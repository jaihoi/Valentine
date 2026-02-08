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
let redisReadyPromise: Promise<boolean> | null = null;
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

  const url = env.REDIS_URL;
  const needsTls = url.startsWith("rediss://");

  redisClient = new IORedis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 1_500,
    ...(needsTls ? { tls: {} } : {}),
  });
  redisClient.on("error", (error) => {
    if (!loggedRedisUnavailable) {
      logger.error(
        { error: String(error) },
        "Redis rate limiter connection error",
      );
      loggedRedisUnavailable = true;
    }
  });
  return redisClient;
}

async function ensureRedisReady(client: IORedis): Promise<boolean> {
  if (client.status === "ready") return true;
  if (redisReadyPromise) return redisReadyPromise;

  redisReadyPromise = (async () => {
    try {
      // With lazyConnect enabled, we must explicitly connect before issuing commands.
      if (client.status === "wait") {
        void client.connect();
      }
    } catch {
      // ignore and let readiness checks resolve false
    }

    const timeoutMs = 1_500;
    return await new Promise<boolean>((resolve) => {
      let settled = false;

      const removeListener = (event: string, handler: () => void) => {
        const anyClient = client as unknown as {
          off?: (event: string, handler: () => void) => void;
          removeListener?: (event: string, handler: () => void) => void;
        };
        if (typeof anyClient.off === "function") {
          anyClient.off(event, handler);
          return;
        }
        if (typeof anyClient.removeListener === "function") {
          anyClient.removeListener(event, handler);
        }
      };

      const settle = (ready: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        removeListener("ready", onReady);
        removeListener("error", onError);
        resolve(ready);
      };

      const onReady = () => settle(true);
      const onError = () => settle(false);
      const timer = setTimeout(() => settle(false), timeoutMs);

      client.on("ready", onReady);
      client.on("error", onError);
    });
  })().finally(() => {
    redisReadyPromise = null;
  });

  return redisReadyPromise;
}

async function getRedisClientReady(): Promise<IORedis | null> {
  const client = getRedisClient();
  if (!client) return null;

  // In tests we mock ioredis, and the mock may not expose a `status` string.
  // If the status isn't available, assume the client is usable.
  const status = (client as unknown as { status?: unknown }).status;
  if (typeof status !== "string") return client;

  const ready = await ensureRedisReady(client);
  return ready ? client : null;
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
  const client = await getRedisClientReady();
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
