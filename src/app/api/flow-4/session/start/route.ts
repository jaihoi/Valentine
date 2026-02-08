import { Prisma, VoiceSessionStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireRateLimit, trackUsage } from "@/lib/api/guards";
import { flow4SessionStartRequestSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/db";
import { isFlowError } from "@/lib/flow-errors";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { failWithCode, ok } from "@/lib/http";
import { startVapiSessionStrict } from "@/lib/providers/vapi";
import { trackEvent } from "@/lib/telemetry";

const ENDPOINT = "/api/flow-4/session/start";

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
    `flow4-session-start:${user.id}`,
    6,
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

  const parsed = flow4SessionStartRequestSchema.safeParse(body);
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

  try {
    const started = await startVapiSessionStrict(
      {
        userId: user.id,
        scenario: payload.scenario,
        partnerName: partner.name,
      },
      { timeoutMs: 6_000, retries: 0 },
    );

    const session = await prisma.voiceSession.create({
      data: {
        userId: user.id,
        partnerProfileId: payload.partner_profile_id,
        scenario: payload.scenario,
        providerSessionId: started.providerSessionId,
        callLinkOrNumber: started.callLinkOrNumber,
        status: VoiceSessionStatus.CREATED,
        providerMeta: {
          ...started.providerMeta,
          flow: "flow4",
        } as Prisma.InputJsonValue,
      },
    });

    await trackUsage(user.id, "FLOW4_SESSION_STARTED", {
      sessionId: session.id,
      partnerProfileId: payload.partner_profile_id,
    });
    await trackEvent(user.id, "FLOW4_SESSION_STARTED", {
      sessionId: session.id,
    });

    return respond(
      ok(
        {
          session_id: session.id,
          call_link_or_number: session.callLinkOrNumber,
          status: session.status,
        },
        200,
        request,
      ),
    );
  } catch (error) {
    if (isFlowError(error)) {
      await trackUsage(user.id, "FLOW4_FAILED", {
        code: error.code,
        provider: error.provider,
      });
      await trackEvent(user.id, "FLOW4_FAILED", {
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

    await trackUsage(user.id, "FLOW4_FAILED", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "vapi",
    });
    await trackEvent(user.id, "FLOW4_FAILED", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "vapi",
    });
    return respond(
      typedFail(
        {
          error: "Failed to start hotline session",
          code: "PROVIDER_ENRICHMENT_FAILED",
          retryable: true,
          provider: "vapi",
          details: String(error),
        },
        502,
        user.id,
      ),
    );
  }
}
