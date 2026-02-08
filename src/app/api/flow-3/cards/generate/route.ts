import { CardStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireRateLimit, trackUsage } from "@/lib/api/guards";
import { flow3CardGenerateRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { failWithCode, ok } from "@/lib/http";
import { moderateText } from "@/lib/moderation";
import { enqueueCardGeneration } from "@/lib/queue";
import { trackEvent } from "@/lib/telemetry";

const ENDPOINT = "/api/flow-3/cards/generate";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  const typedFail = (
    options: Parameters<typeof failWithCode>[0],
    status: number,
    userId: string | null,
  ) =>
    failWithCode(options, status, {
      request,
      route: ENDPOINT,
      userId,
      code: options.code,
      provider: options.provider,
      retryable: options.retryable,
      mutation: true,
    });

  if (!user) {
    return typedFail(
      {
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
        retryable: false,
      },
      401,
      null,
    );
  }

  const limited = await requireRateLimit(
    `flow3-card-generate:${user.id}`,
    8,
    60_000,
    {
      request,
      route: ENDPOINT,
      userId: user.id,
    },
  );
  if (limited) return limited;

  const idempotencyKey = getRequestIdempotencyKey(request);
  const replayed = await getIdempotentReplayResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
  );
  if (replayed) return replayed;
  const respond = (response: Parameters<typeof maybeSaveIdempotentResponse>[3]) =>
    maybeSaveIdempotentResponse(user.id, ENDPOINT, idempotencyKey, response);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(
      typedFail(
        {
          error: "Malformed JSON body",
          code: "VALIDATION_ERROR",
          retryable: false,
        },
        400,
        user.id,
      ),
    );
  }

  const parsed = flow3CardGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return respond(
      typedFail(
        {
          error: "Invalid request payload",
          code: "VALIDATION_ERROR",
          retryable: false,
          details: parsed.error.flatten(),
        },
        400,
        user.id,
      ),
    );
  }
  const payload = parsed.data;

  const partner = await prisma.partnerProfile.findFirst({
    where: {
      id: payload.partner_profile_id,
      userId: user.id,
    },
  });
  if (!partner) {
    await trackUsage(user.id, "FLOW3_FAILED", {
      code: "PARTNER_PROFILE_REQUIRED",
    });
    await trackEvent(user.id, "FLOW3_FAILED", {
      code: "PARTNER_PROFILE_REQUIRED",
    });
    return respond(
      typedFail(
        {
          error: "partner_profile_id not found for current user",
          code: "PARTNER_PROFILE_REQUIRED",
          retryable: false,
        },
        422,
        user.id,
      ),
    );
  }

  const assets = await prisma.memoryAsset.findMany({
    where: {
      id: { in: payload.asset_ids },
      userId: user.id,
    },
  });
  if (assets.length !== payload.asset_ids.length) {
    await trackUsage(user.id, "FLOW3_FAILED", {
      code: "VALIDATION_ERROR",
    });
    await trackEvent(user.id, "FLOW3_FAILED", {
      code: "VALIDATION_ERROR",
    });
    return respond(
      typedFail(
        {
          error: "One or more asset_ids are invalid for current user",
          code: "VALIDATION_ERROR",
          retryable: false,
        },
        422,
        user.id,
      ),
    );
  }

  const moderation = await moderateText(payload.message_text);
  if (!moderation.allowed) {
    await trackUsage(user.id, "FLOW3_FAILED", {
      code: "VALIDATION_ERROR",
      reason: moderation.reason ?? "blocked_by_moderation",
    });
    await trackEvent(user.id, "FLOW3_FAILED", {
      code: "VALIDATION_ERROR",
      reason: moderation.reason ?? "blocked_by_moderation",
    });
    return respond(
      typedFail(
        {
          error: "Input blocked by moderation",
          code: "VALIDATION_ERROR",
          retryable: false,
          details: moderation.reason,
        },
        422,
        user.id,
      ),
    );
  }

  await trackUsage(user.id, "FLOW3_CARD_SUBMITTED", {
    partnerProfileId: payload.partner_profile_id,
    templateId: payload.template_id,
    assetCount: payload.asset_ids.length,
  });
  await trackEvent(user.id, "FLOW3_CARD_SUBMITTED", {
    templateId: payload.template_id,
    assetCount: payload.asset_ids.length,
  });

  try {
    const card = await prisma.cardProject.create({
      data: {
        userId: user.id,
        partnerProfileId: payload.partner_profile_id,
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

    return respond(
      ok(
        {
          card_id: card.id,
          status: card.status,
          preview_url: card.previewUrl,
        },
        200,
        request,
      ),
    );
  } catch (error) {
    await trackUsage(user.id, "FLOW3_FAILED", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "queue",
      details: String(error),
    });
    await trackEvent(user.id, "FLOW3_FAILED", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "queue",
    });

    return respond(
      typedFail(
        {
          error: "Card generation request failed",
          code: "PROVIDER_ENRICHMENT_FAILED",
          retryable: true,
          provider: "queue",
          details: String(error),
        },
        502,
        user.id,
      ),
    );
  }
}
