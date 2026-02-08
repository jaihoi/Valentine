import { NextRequest } from "next/server";
import { createSessionToken, hashPassword, setSessionCookie } from "@/lib/auth";
import {
  getRequestRateLimitIdentity,
  requireRateLimit,
} from "@/lib/api/guards";
import { registerSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { fail, ok, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  const ENDPOINT = "/api/auth/register";
  const identity = getRequestRateLimitIdentity(request);
  const limited = await requireRateLimit(`auth-register:${identity}`, 5, 60_000, {
    request,
    route: ENDPOINT,
    userId: null,
  });
  if (limited) return limited;

  const parsed = await parseJson(request, registerSchema);
  if (parsed.error) return parsed.error;

  const { email, password, name } = parsed.data!;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return fail("Email already registered", 409, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      retryable: false,
      mutation: true,
    });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true },
  });

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
  });
  await setSessionCookie(token);

  return ok({ user }, 201, request);
}
