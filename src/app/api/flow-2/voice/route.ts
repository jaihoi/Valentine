import { GeneratedContentType } from "@prisma/client";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireRateLimit, trackUsage } from "@/lib/api/guards";
import { flow2VoiceRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { isFlowError } from "@/lib/flow-errors";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { failWithCode, ok } from "@/lib/http";
import { moderateText } from "@/lib/moderation";
import { uploadAudioBufferStrict } from "@/lib/providers/cloudinary";
import { synthesizeVoiceStrict } from "@/lib/providers/elevenlabs";
import { trackEvent } from "@/lib/telemetry";

const allowedSourceTypes = [
  GeneratedContentType.LOVE_LETTER,
  GeneratedContentType.SMS,
  GeneratedContentType.CAPTION,
];
const ENDPOINT = "/api/flow-2/voice";

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

  const limited = await requireRateLimit(`flow2-voice:${user.id}`, 10, 60_000, {
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

  const parsed = flow2VoiceRequestSchema.safeParse(body);
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

  const sourceContent = await prisma.generatedContent.findFirst({
    where: {
      id: payload.source_content_id,
      userId: user.id,
      type: { in: allowedSourceTypes },
    },
  });
  if (!sourceContent) {
    return respond(
      typedFail(
        {
          error: "source_content_id not found for current user",
          code: "VALIDATION_ERROR",
          retryable: false,
        },
        422,
        user.id,
      ),
    );
  }

  const moderation = await moderateText(payload.text);
  if (!moderation.allowed) {
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

  await trackUsage(user.id, "FLOW2_VOICE_SUBMITTED", {
    partnerProfileId: payload.partner_profile_id,
    sourceContentId: payload.source_content_id,
  });
  await trackEvent(user.id, "FLOW2_VOICE_SUBMITTED", {
    sourceContentId: payload.source_content_id,
  });

  try {
    const audioBuffer = await synthesizeVoiceStrict(payload.text, payload.voice_id, {
      timeoutMs: 6_000,
      retries: 0,
    });

    const uploaded = await uploadAudioBufferStrict(
      audioBuffer,
      `flow2-voice-${user.id}-${Date.now()}`,
      { timeoutMs: 6_000 },
    );

    const saved = await prisma.voiceAsset.create({
      data: {
        userId: user.id,
        sourceText: payload.text,
        style: payload.style,
        provider: "elevenlabs",
        providerVoiceId: payload.voice_id,
        audioUrl: uploaded.secure_url,
        cloudinaryId: uploaded.public_id,
      },
    });

    await trackUsage(user.id, "VOICE_ASSET_CREATED", {
      voiceAssetId: saved.id,
      flow: "flow2",
    });
    await trackUsage(user.id, "FLOW2_COMPLETED", {
      voiceAssetId: saved.id,
      sourceContentId: payload.source_content_id,
    });
    await trackEvent(user.id, "FLOW2_COMPLETED", {
      voiceAssetId: saved.id,
    });

    return respond(
      ok(
        {
          audio_asset_id: saved.id,
          audio_url: saved.audioUrl,
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
          error: "Voice generation failed",
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
