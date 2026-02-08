import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireRateLimit, trackUsage } from "@/lib/api/guards";
import { giftRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { isFlowError } from "@/lib/flow-errors";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { failWithCode, ok } from "@/lib/http";
import { createStrictGiftRecommendation } from "@/lib/flow5/gift-service";
import { trackEvent } from "@/lib/telemetry";

const ENDPOINT = "/api/gifts/recommend";

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

  const limited = await requireRateLimit(`gift-plan:${user.id}`, 12, 60_000, {
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

  const parsed = giftRequestSchema.safeParse(body);
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

  if (payload.partner_profile_id) {
    const partner = await prisma.partnerProfile.findFirst({
      where: {
        id: payload.partner_profile_id,
        userId: user.id,
      },
    });
    if (!partner) {
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
  }

  try {
    const strict = await createStrictGiftRecommendation({
      userId: user.id,
      partnerProfileId: payload.partner_profile_id,
      interests: payload.interests,
      budget: payload.budget,
      constraints: payload.constraints,
      flowTag: "legacy-gifts",
    });

    await trackUsage(user.id, "GIFT_RECOMMENDATION_CREATED", {
      recommendationId: strict.saved.id,
      strict: true,
    });

    return respond(
      ok(
        {
          recommendations: strict.gift.recommendations,
          explanation: strict.gift.explanation,
          links: strict.gift.links,
        },
        200,
        request,
      ),
    );
  } catch (error) {
    if (isFlowError(error)) {
      await trackEvent(user.id, "FLOW5_FAILED", {
        code: error.code,
        provider: error.provider,
        endpoint: "/api/gifts/recommend",
      });
      return respond(
        typedFail(
          {
            error: error.message,
            code: error.code,
            retryable: error.retryable,
            provider: error.provider,
            details: error.details,
          },
          error.status,
          user.id,
        ),
      );
    }

    await trackEvent(user.id, "FLOW5_FAILED", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "unknown",
      endpoint: "/api/gifts/recommend",
    });
    return respond(
      typedFail(
        {
          error: "Gift recommendation failed",
          code: "PROVIDER_ENRICHMENT_FAILED",
          retryable: true,
          provider: "unknown",
          details: String(error),
        },
        502,
        user.id,
      ),
    );
  }
}
