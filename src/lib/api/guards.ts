import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { failWithCode } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/telemetry";

export async function requireUser(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return {
      user: null,
      error: failWithCode(
        {
          error: "Unauthorized",
          code: "AUTH_REQUIRED",
          retryable: false,
        },
        401,
        {
          request,
          route: request.nextUrl.pathname,
          userId: null,
          code: "AUTH_REQUIRED",
          retryable: false,
          mutation: request.method.toUpperCase() !== "GET",
        },
      ),
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
      return failWithCode(
        {
          error: "Service temporarily unavailable. Please try again.",
          code: "RATE_LIMIT_UNAVAILABLE",
          retryable: true,
          details: {
            resetAt: result.resetAt,
            remaining: result.remaining,
          },
        },
        503,
        {
          request,
          route,
          userId,
          code: "RATE_LIMIT_UNAVAILABLE",
          retryable: true,
          mutation: true,
        },
      );
    }

    return failWithCode(
      {
        error: "Too many requests. Please wait and try again.",
        code: "RATE_LIMIT_EXCEEDED",
        retryable: true,
        details: {
          resetAt: result.resetAt,
          remaining: result.remaining,
        },
      },
      429,
      { request, route, userId, code: "RATE_LIMIT_EXCEEDED", retryable: true, mutation: true },
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
