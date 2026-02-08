import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRateLimit, requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { ok, parseJson } from "@/lib/http";

const preferenceSchema = z.object({
  city: z.string().max(100).optional(),
  budget_min: z.number().int().min(0).optional(),
  budget_max: z.number().int().min(0).optional(),
  vibe: z.string().max(100).optional(),
  dietary: z.string().max(120).optional(),
});

const ENDPOINT = "/api/preferences";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;

  const preference = await prisma.preferenceProfile.findFirst({
    where: { userId: auth.user!.id },
    orderBy: { createdAt: "desc" },
  });

  return ok({ preference }, 200, request);
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;

  const limited = await requireRateLimit(`preferences:${user.id}`, 25, 60_000, {
    request,
    route: ENDPOINT,
    userId: user.id,
  });
  if (limited) return limited;

  const idempotencyKey = getRequestIdempotencyKey(request);
  const replayed = await getIdempotentReplayResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
  );
  if (replayed) return replayed;

  const parsed = await parseJson(request, preferenceSchema);
  if (parsed.error) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      parsed.error,
    );
  }
  const payload = parsed.data!;

  const preference = await prisma.preferenceProfile.create({
    data: {
      userId: user.id,
      city: payload.city,
      budgetMin: payload.budget_min,
      budgetMax: payload.budget_max,
      vibe: payload.vibe,
      dietary: payload.dietary,
    },
  });

  return maybeSaveIdempotentResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
    ok({ preference }, 201, request),
  );
}
