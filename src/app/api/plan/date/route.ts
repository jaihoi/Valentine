import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateDatePlanStrict } from "@/lib/ai/orchestrator";
import { requireRateLimit, trackUsage } from "@/lib/api/guards";
import { datePlanRequestSchema } from "@/lib/api/schemas";
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

const ENDPOINT = "/api/plan/date";

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

  const limited = await requireRateLimit(`date-plan:${user.id}`, 12, 60_000, {
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

  const parsed = datePlanRequestSchema.safeParse(body);
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

  if (!payload.partner_profile_id) {
    return respond(
      typedFail(
        {
          error: "partner_profile_id is required for Flow 1 date generation",
          code: "PARTNER_PROFILE_REQUIRED",
          retryable: false,
        },
        422,
        user.id,
      ),
    );
  }

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

  await trackUsage(user.id, "FLOW1_DATE_PLAN_SUBMITTED", {
    city: payload.city,
    partnerProfileId: payload.partner_profile_id,
  });
  await trackEvent(user.id, "FLOW1_DATE_PLAN_SUBMITTED", {
    city: payload.city,
  });

  try {
    const generated = await generateDatePlanStrict(payload);
    const moderation = await moderateText(generated.plan.rationale);
    if (!moderation.allowed) {
      await trackEvent(user.id, "FLOW1_FAILED", {
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

    const saved = await prisma.datePlan.create({
      data: {
        userId: user.id,
        partnerProfileId: payload.partner_profile_id,
        city: payload.city,
        budget: payload.budget,
        vibe: payload.vibe,
        dietary: payload.dietary,
        dateTime: payload.date_time ? new Date(payload.date_time) : null,
        itinerary: generated.plan.itinerary,
        venueOptions: generated.plan.venue_options,
        estimatedCost: generated.plan.estimated_cost,
        rationale: generated.plan.rationale,
        providerMeta: {
          ...generated.providerMeta,
          sources: generated.sources,
        } as Prisma.InputJsonValue,
      },
    });

    await trackUsage(user.id, "DATE_PLAN_CREATED", {
      planId: saved.id,
      city: payload.city,
    });
    await trackUsage(user.id, "FLOW1_DATE_PLAN_SAVED", {
      planId: saved.id,
    });
    await trackEvent(user.id, "FLOW1_DATE_PLAN_SAVED", {
      planId: saved.id,
    });

    return respond(
      ok(
        {
          plan_id: saved.id,
          itinerary: generated.plan.itinerary,
          venue_options: generated.plan.venue_options,
          estimated_cost: generated.plan.estimated_cost,
          rationale: generated.plan.rationale,
          sources: generated.sources,
        },
        200,
        request,
      ),
    );
  } catch (error) {
    if (isFlowError(error)) {
      await trackEvent(user.id, "FLOW1_FAILED", {
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

    await trackEvent(user.id, "FLOW1_FAILED", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "unknown",
    });

    return respond(
      typedFail(
        {
          error: "Date plan generation failed",
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
