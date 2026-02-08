import { GeneratedContentType, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { generateLoveLetterStrict } from "@/lib/ai/orchestrator";
import { getCurrentUser } from "@/lib/auth";
import { requireRateLimit, trackUsage } from "@/lib/api/guards";
import { flow2LoveLetterRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { isFlowError } from "@/lib/flow-errors";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { failWithCode, ok } from "@/lib/http";
import { moderateText } from "@/lib/moderation";
import { trackEvent } from "@/lib/telemetry";

const ENDPOINT = "/api/flow-2/love-letter";

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
    `flow2-love-letter:${user.id}`,
    10,
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

  const parsed = flow2LoveLetterRequestSchema.safeParse(body);
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

  await trackUsage(user.id, "FLOW2_LETTER_SUBMITTED", {
    partnerProfileId: payload.partner_profile_id,
    tone: payload.tone,
    length: payload.length,
  });
  await trackEvent(user.id, "FLOW2_LETTER_SUBMITTED", {
    tone: payload.tone,
    length: payload.length,
  });

  try {
    const generated = await generateLoveLetterStrict({
      tone: payload.tone,
      length: payload.length,
      memories: payload.memories,
      partner_name: partner.name,
    });

    const moderation = await moderateText(
      `${generated.letter_text}\n${generated.short_sms}\n${generated.caption_versions.join(
        "\n",
      )}`,
    );
    if (!moderation.allowed) {
      await trackEvent(user.id, "FLOW2_FAILED", {
        code: "VALIDATION_ERROR",
        reason: moderation.reason ?? "blocked_by_moderation",
      });
      return respond(
        typedFail(
          {
            error: "Generated content blocked by moderation",
            code: "VALIDATION_ERROR",
            retryable: false,
            details: moderation.reason,
          },
          422,
          user.id,
        ),
      );
    }

    const savedLetter = await prisma.$transaction(async (tx) => {
      const letter = await tx.generatedContent.create({
        data: {
          userId: user.id,
          type: GeneratedContentType.LOVE_LETTER,
          tone: payload.tone,
          length: payload.length,
          content: generated.letter_text,
          metadata: {
            flow: "flow2",
            partnerProfileId: payload.partner_profile_id,
            partnerName: partner.name,
            memories: payload.memories,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.generatedContent.create({
        data: {
          userId: user.id,
          type: GeneratedContentType.SMS,
          tone: payload.tone,
          length: "short",
          content: generated.short_sms,
          metadata: {
            flow: "flow2",
            sourceLetterId: letter.id,
            partnerProfileId: payload.partner_profile_id,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.generatedContent.create({
        data: {
          userId: user.id,
          type: GeneratedContentType.CAPTION,
          tone: payload.tone,
          length: payload.length,
          content: generated.caption_versions.join("\n"),
          metadata: {
            flow: "flow2",
            sourceLetterId: letter.id,
            partnerProfileId: payload.partner_profile_id,
          } as Prisma.InputJsonValue,
        },
      });

      return letter;
    });

    await trackUsage(user.id, "FLOW2_LETTER_SAVED", {
      letterContentId: savedLetter.id,
      partnerProfileId: payload.partner_profile_id,
    });
    await trackEvent(user.id, "FLOW2_LETTER_SAVED", {
      letterContentId: savedLetter.id,
    });

    return respond(
      ok(
        {
          letter_content_id: savedLetter.id,
          letter_text: generated.letter_text,
          short_sms: generated.short_sms,
          caption_versions: generated.caption_versions,
        },
        200,
        request,
      ),
    );
  } catch (error) {
    if (isFlowError(error)) {
      await trackEvent(user.id, "FLOW2_FAILED", {
        code: error.code,
        provider: error.provider,
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

    await trackEvent(user.id, "FLOW2_FAILED", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "unknown",
    });

    return respond(
      typedFail(
        {
          error: "Love letter generation failed",
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
