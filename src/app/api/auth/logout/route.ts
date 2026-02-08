import { NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import {
  getRequestRateLimitIdentity,
  requireRateLimit,
} from "@/lib/api/guards";
import { ok } from "@/lib/http";

export async function POST(request: NextRequest) {
  const identity = getRequestRateLimitIdentity(request);
  const limited = await requireRateLimit(`auth-logout:${identity}`, 30, 60_000, {
    request,
    route: "/api/auth/logout",
    userId: null,
  });
  if (limited) return limited;

  await clearSessionCookie();
  return ok({ success: true }, 200, request);
}
