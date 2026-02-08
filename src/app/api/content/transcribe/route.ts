import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRateLimit, requireUser, trackUsage } from "@/lib/api/guards";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { fail, ok, parseJson } from "@/lib/http";
import { transcribeAudioUrl } from "@/lib/providers/deepgram";

const transcribeSchema = z.object({
  audio_url: z.string().url(),
});
const ENDPOINT = "/api/content/transcribe";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;

  const limited = await requireRateLimit(`transcribe:${user.id}`, 15, 60_000, {
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

  const parsed = await parseJson(request, transcribeSchema);
  if (parsed.error) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      parsed.error,
    );
  }

  const transcript = await transcribeAudioUrl(parsed.data!.audio_url);
  if (!transcript) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      fail("Transcription failed", 502, undefined, {
        request,
        route: ENDPOINT,
        userId: user.id,
        code: "PROVIDER_ENRICHMENT_FAILED",
        provider: "deepgram",
        retryable: true,
        mutation: true,
      }),
    );
  }

  await trackUsage(user.id, "VOICE_TRANSCRIBED", { length: transcript.length });
  return maybeSaveIdempotentResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
    ok({ transcript }, 200, request),
  );
}
