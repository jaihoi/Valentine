import { NextRequest } from "next/server";
import { requireRateLimit, requireUser, trackUsage } from "@/lib/api/guards";
import { partnerProfileSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { ok, parseJson } from "@/lib/http";
import { trackEvent } from "@/lib/telemetry";

const ENDPOINT = "/api/partner-profile";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;

  const profiles = await prisma.partnerProfile.findMany({
    where: { userId: auth.user!.id },
    orderBy: { createdAt: "desc" },
  });

  return ok({ profiles }, 200, request);
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;

  const limited = await requireRateLimit(`partner-profile:${user.id}`, 25, 60_000, {
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

  const parsed = await parseJson(request, partnerProfileSchema);
  if (parsed.error) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      parsed.error,
    );
  }

  const payload = parsed.data!;
  const profile = await prisma.partnerProfile.create({
    data: {
      userId: user.id,
      name: payload.name,
      interests: payload.interests,
      dislikes: payload.dislikes,
      notes: payload.notes,
    },
  });

  await trackUsage(user.id, "FLOW1_PARTNER_PROFILE_COMPLETED", {
    partnerProfileId: profile.id,
  });
  await trackEvent(user.id, "FLOW1_PARTNER_PROFILE_COMPLETED", {
    partnerProfileId: profile.id,
  });

  return maybeSaveIdempotentResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
    ok({ profile }, 201, request),
  );
}
