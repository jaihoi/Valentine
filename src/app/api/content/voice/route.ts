import { NextRequest } from "next/server";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { requireRateLimit, requireUser, trackUsage } from "@/lib/api/guards";
import { voiceRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { fail, ok, parseJson } from "@/lib/http";
import { moderateText } from "@/lib/moderation";
import { uploadAudioBuffer } from "@/lib/providers/cloudinary";
import { synthesizeVoice } from "@/lib/providers/elevenlabs";

const ENDPOINT = "/api/content/voice";
const FALLBACK_AUDIO_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAA";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;

  const limited = await requireRateLimit(`voice:${user.id}`, 10, 60_000, {
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

  const parsed = await parseJson(request, voiceRequestSchema);
  if (parsed.error) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      parsed.error,
    );
  }
  const payload = parsed.data!;

  const moderation = await moderateText(payload.text);
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

  const audioBuffer = await synthesizeVoice(payload.text, payload.voice_id);
  let audioUrl = FALLBACK_AUDIO_DATA_URI;
  let cloudinaryId: string | undefined;

  if (audioBuffer) {
    const uploaded = await uploadAudioBuffer(
      audioBuffer,
      `voice-${user.id}-${Date.now()}`,
    );

    if (uploaded?.secure_url) {
      audioUrl = uploaded.secure_url;
      cloudinaryId = uploaded.public_id;
    } else {
      const fallbackBase64 = audioBuffer.toString("base64");
      audioUrl = `data:audio/mpeg;base64,${fallbackBase64}`;
    }
  }

  const saved = await prisma.voiceAsset.create({
    data: {
      userId: user.id,
      sourceText: payload.text,
      style: payload.style,
      provider: "elevenlabs",
      providerVoiceId: payload.voice_id,
      audioUrl,
      cloudinaryId,
    },
  });

  const responseBody = {
    audio_asset_id: saved.id,
    audio_url: audioUrl,
  };

  await trackUsage(user.id, "VOICE_ASSET_CREATED", {
    voiceAssetId: saved.id,
  });

  return maybeSaveIdempotentResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
    ok(responseBody, 200, request),
  );
}
