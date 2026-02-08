import { CardStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { enqueueCardGeneration } from "@/lib/queue";
import { requireRateLimit, requireUser, trackUsage } from "@/lib/api/guards";
import { cardGenerateRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { fail, ok, parseJson } from "@/lib/http";
import { moderateText } from "@/lib/moderation";

const ENDPOINT = "/api/cards/generate";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;

  const limited = await requireRateLimit(`card-generate:${user.id}`, 8, 60_000, {
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

  const parsed = await parseJson(request, cardGenerateRequestSchema);
  if (parsed.error) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      parsed.error,
    );
  }
  const payload = parsed.data!;

  const moderation = await moderateText(payload.message_text);
  if (!moderation.allowed) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      fail("Input blocked by moderation", 422, moderation.reason, {
        request,
        route: ENDPOINT,
        userId: user.id,
        code: "VALIDATION_ERROR",
        retryable: false,
        mutation: true,
      }),
    );
  }

  const assets = await prisma.memoryAsset.findMany({
    where: {
      id: { in: payload.asset_ids },
      userId: user.id,
    },
  });
  if (assets.length !== payload.asset_ids.length) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      fail("One or more asset_ids are invalid", 404, undefined, {
        request,
        route: ENDPOINT,
        userId: user.id,
        code: "VALIDATION_ERROR",
        retryable: false,
        mutation: true,
      }),
    );
  }

  const card = await prisma.cardProject.create({
    data: {
      userId: user.id,
      templateId: payload.template_id,
      messageText: payload.message_text,
      musicOption: payload.music_option,
      status: CardStatus.QUEUED,
      assets: {
        connect: payload.asset_ids.map((id) => ({ id })),
      },
    },
  });

  await enqueueCardGeneration(card.id);

  const latest = await prisma.cardProject.findUnique({
    where: { id: card.id },
  });

  const responseBody = {
    card_id: card.id,
    preview_url: latest?.previewUrl ?? null,
    status: latest?.status ?? CardStatus.QUEUED,
  };

  await trackUsage(user.id, "CARD_GENERATION_REQUESTED", {
    cardId: card.id,
    template: payload.template_id,
  });

  return maybeSaveIdempotentResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
    ok(responseBody, 200, request),
  );
}
