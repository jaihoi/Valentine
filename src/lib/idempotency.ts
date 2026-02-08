import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULT_TTL_HOURS = 24;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

type IdempotencyDelegate = {
  findUnique: typeof prisma.idempotencyRecord.findUnique;
  delete: typeof prisma.idempotencyRecord.delete;
  upsert: typeof prisma.idempotencyRecord.upsert;
};

function getIdempotencyDelegate(): IdempotencyDelegate | null {
  const delegate = (
    prisma as unknown as { idempotencyRecord?: IdempotencyDelegate }
  ).idempotencyRecord;
  return delegate ?? null;
}

export async function getIdempotentResponse(
  userId: string,
  endpoint: string,
  rawKey: string,
) {
  const idempotency = getIdempotencyDelegate();
  if (!idempotency) return null;

  const keyHash = hashKey(rawKey);
  const now = new Date();
  const record = await idempotency.findUnique({
    where: {
      userId_endpoint_keyHash: {
        userId,
        endpoint,
        keyHash,
      },
    },
  });

  if (!record) return null;
  if (record.expiresAt <= now) {
    await idempotency.delete({
      where: { id: record.id },
    });
    return null;
  }

  return record;
}

export async function saveIdempotentResponse(
  userId: string,
  endpoint: string,
  rawKey: string,
  statusCode: number,
  responseBody: Prisma.InputJsonValue,
  ttlHours = DEFAULT_TTL_HOURS,
) {
  const idempotency = getIdempotencyDelegate();
  if (!idempotency) return null;

  const keyHash = hashKey(rawKey);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  return idempotency.upsert({
    where: {
      userId_endpoint_keyHash: {
        userId,
        endpoint,
        keyHash,
      },
    },
    update: {
      statusCode,
      responseBody,
      expiresAt,
    },
    create: {
      userId,
      endpoint,
      keyHash,
      statusCode,
      responseBody,
      expiresAt,
    },
  });
}

export function getRequestIdempotencyKey(request: Request): string | null {
  const rawKey = request.headers.get("Idempotency-Key");
  if (!rawKey) return null;
  const trimmed = rawKey.trim();
  if (!trimmed || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return null;
  }
  return trimmed;
}

export function withIdempotencyHeaders<T extends NextResponse>(
  response: T,
  rawKey: string | null,
  replayed: boolean,
): T {
  if (!rawKey) return response;
  response.headers.set("Idempotency-Key", rawKey);
  response.headers.set("Idempotency-Replayed", replayed ? "true" : "false");
  return response;
}

export async function getIdempotentReplayResponse(
  userId: string,
  endpoint: string,
  rawKey: string | null,
): Promise<NextResponse | null> {
  if (!rawKey) return null;
  const record = await getIdempotentResponse(userId, endpoint, rawKey);
  if (!record) return null;

  const response = NextResponse.json(record.responseBody, {
    status: record.statusCode,
  });
  return withIdempotencyHeaders(response, rawKey, true);
}

export async function maybeSaveIdempotentResponse(
  userId: string,
  endpoint: string,
  rawKey: string | null,
  response: NextResponse,
): Promise<NextResponse> {
  if (!rawKey) return response;

  let responseBody: Prisma.InputJsonValue = {};
  try {
    responseBody = (await response.clone().json()) as Prisma.InputJsonValue;
  } catch {
    responseBody = {};
  }

  await saveIdempotentResponse(
    userId,
    endpoint,
    rawKey,
    response.status,
    responseBody,
  );
  return withIdempotencyHeaders(response, rawKey, false);
}
