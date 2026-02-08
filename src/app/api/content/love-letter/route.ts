import { Prisma, GeneratedContentType } from "@prisma/client";
import { NextRequest } from "next/server";
import { generateLoveLetter } from "@/lib/ai/orchestrator";
import { requireRateLimit, requireUser, trackUsage } from "@/lib/api/guards";
import { loveLetterRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { fail, ok, parseJson } from "@/lib/http";
import { moderateText } from "@/lib/moderation";

const ENDPOINT = "/api/content/love-letter";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;

  const limited = await requireRateLimit(`love-letter:${user.id}`, 10, 60_000, {
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

  const parsed = await parseJson(request, loveLetterRequestSchema);
  if (parsed.error) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      parsed.error,
    );
  }
  const payload = parsed.data!;

  const generated = await generateLoveLetter(payload);
  const moderation = await moderateText(
    `${generated.letter_text}\n${generated.short_sms}\n${generated.caption_versions.join(
      "\n",
    )}`,
  );

  if (!moderation.allowed) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      fail("Generated content blocked by moderation", 422, moderation.reason, {
        request,
        route: ENDPOINT,
        userId: user.id,
        code: "VALIDATION_ERROR",
        retryable: false,
        mutation: true,
      }),
    );
  }

  await prisma.$transaction([
    prisma.generatedContent.create({
      data: {
        userId: user.id,
        type: GeneratedContentType.LOVE_LETTER,
        tone: payload.tone,
        length: payload.length,
        content: generated.letter_text,
        metadata: {
          partnerName: payload.partner_name,
        } as Prisma.InputJsonValue,
      },
    }),
    prisma.generatedContent.create({
      data: {
        userId: user.id,
        type: GeneratedContentType.SMS,
        tone: payload.tone,
        length: "short",
        content: generated.short_sms,
      },
    }),
    prisma.generatedContent.create({
      data: {
        userId: user.id,
        type: GeneratedContentType.CAPTION,
        tone: payload.tone,
        length: payload.length,
        content: generated.caption_versions.join("\n"),
      },
    }),
  ]);

  await trackUsage(user.id, "LOVE_LETTER_CREATED", {
    tone: payload.tone,
    length: payload.length,
  });

  return maybeSaveIdempotentResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
    ok(generated, 200, request),
  );
}
