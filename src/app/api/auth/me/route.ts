import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return fail("Unauthorized", 401, undefined, {
      request,
      route: "/api/auth/me",
      userId: null,
      code: "AUTH_REQUIRED",
      retryable: false,
      mutation: false,
    });
  }
  return ok({ user }, 200, request);
}
