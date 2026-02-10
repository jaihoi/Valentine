import { NextRequest } from "next/server";
import {
  createSessionToken,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import {
  getRequestRateLimitIdentity,
  requireRateLimit,
} from "@/lib/api/guards";
import { loginSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { fail, ok, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  const ENDPOINT = "/api/auth/login";
  const identity = getRequestRateLimitIdentity(request);
  const limited = await requireRateLimit(
    `auth-login:${identity}`,
    10,
    60_000,
    {
      request,
      route: ENDPOINT,
      userId: null,
    },
    { allowMemoryFallback: true },
  );
  if (limited) return limited;

  const parsed = await parseJson(request, loginSchema);
  if (parsed.error) return parsed.error;

  const { email, password } = parsed.data!;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return fail("Invalid email or password", 401, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "AUTH_REQUIRED",
      retryable: false,
      mutation: true,
    });
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return fail("Invalid email or password", 401, undefined, {
      request,
      route: ENDPOINT,
      userId: user.id,
      code: "AUTH_REQUIRED",
      retryable: false,
      mutation: true,
    });
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
  });
  await setSessionCookie(token);

  return ok(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    },
    200,
    request,
  );
}
