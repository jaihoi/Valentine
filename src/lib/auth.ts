import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const SESSION_COOKIE = "valentine_session";
const JWT_ALG = "HS256";

type SessionClaims = {
  userId: string;
  email: string;
  name: string | null;
};

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(
  claims: SessionClaims,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const verified = await jwtVerify<SessionClaims>(token, getJwtSecret(), {
      algorithms: [JWT_ALG],
    });
    return verified.payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function getCurrentUser(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, name: true },
  });
  return user;
}
