import { Prisma, VoiceSessionStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireRateLimit, requireUser, trackUsage } from "@/lib/api/guards";
import { vapiStartRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { fail, ok, parseJson } from "@/lib/http";
import { startVapiSession } from "@/lib/providers/vapi";

const ENDPOINT = "/api/vapi/session/start";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;
  const typedFail = (
    error: string,
    status: number,
    details?: unknown,
    options?: {
      code?: string;
      provider?: string;
      retryable?: boolean;
    },
  ) =>
    fail(error, status, details, {
      request,
      route: ENDPOINT,
      userId: user.id,
      code: options?.code,
      provider: options?.provider,
      retryable: options?.retryable,
      mutation: true,
    });

  const limited = await requireRateLimit(`vapi-session:${user.id}`, 6, 60_000, {
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

  const parsed = await parseJson(request, vapiStartRequestSchema);
  if (parsed.error) return respond(parsed.error);
  const payload = parsed.data!;

  if (payload.user_id !== user.id) {
    return respond(
      typedFail("user_id must match authenticated user", 403, undefined, {
        code: "VALIDATION_ERROR",
        retryable: false,
      }),
    );
  }

  let partnerName: string | undefined;
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
          "partner_profile_id not found for current user",
          404,
          undefined,
          {
            code: "PARTNER_PROFILE_REQUIRED",
            retryable: false,
          },
        ),
      );
    }
    partnerName = partner.name;
  }

  const started = await startVapiSession({
    userId: user.id,
    scenario: payload.scenario,
    partnerName,
  });

  const session = await prisma.voiceSession.create({
    data: {
      userId: user.id,
      partnerProfileId: payload.partner_profile_id,
      scenario: payload.scenario,
      providerSessionId: started.providerSessionId,
      callLinkOrNumber: started.callLinkOrNumber,
      status: VoiceSessionStatus.CREATED,
      providerMeta: started.providerMeta as Prisma.InputJsonValue,
    },
  });

  await trackUsage(user.id, "VAPI_SESSION_STARTED", {
    sessionId: session.id,
  });

  return respond(
    ok(
      {
        session_id: session.id,
        call_link_or_number: session.callLinkOrNumber,
      },
      200,
      request,
    ),
  );
}
