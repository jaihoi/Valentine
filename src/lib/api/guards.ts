import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { fail } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/telemetry";

export async function requireUser(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return {
      user: null,
      error: fail("Unauthorized", 401, undefined, {
        request,
        code: "AUTH_REQUIRED",
        mutation: request.method.toUpperCase() !== "GET",
      }),
    };
  }
  return { user };
}

export function getRequestRateLimitIdentity(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwarded = forwardedFor?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded")?.trim();
  return firstForwarded || realIp || forwarded || "unknown";
}

export async function requireRateLimit(
  key: string,
  limit = 30,
  windowMs = 60 * 1000,
  context?: {
    request?: NextRequest;
    route?: string;
    userId?: string | null;
  },
) {
  const result = await checkRateLimit({ key, limit, windowMs });
  if (!result.allowed) {
    const request = context?.request;
    const route = context?.route;
    const userId = context?.userId;

    if (result.reason === "limiter_unavailable") {
      if (env.NODE_ENV === "production") {
        await trackEvent("system", "REDIS_UNAVAILABLE_PROD", {
          route: route ?? "unknown",
          userId: userId ?? null,
          key,
        });
      }
      return fail(
        "Rate limiter unavailable",
        503,
        {
          code: "RATE_LIMIT_UNAVAILABLE",
          resetAt: result.resetAt,
          remaining: result.remaining,
        },
        { request, route, userId, code: "RATE_LIMIT_UNAVAILABLE", mutation: true },
      );
    }

    return fail(
      "Rate limit exceeded",
      429,
      {
        resetAt: result.resetAt,
        remaining: result.remaining,
      },
      { request, route, userId, code: "RATE_LIMIT_EXCEEDED", mutation: true },
    );
  }
  return null;
}

export async function trackUsage(
  userId: string | null,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  await prisma.usageEvent.create({
    data: {
      userId,
      eventType,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}
