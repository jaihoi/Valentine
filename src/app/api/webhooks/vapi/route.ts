import { Prisma, VoiceSessionStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { trackUsage } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { logger } from "@/lib/logger";
import { verifyVapiWebhook } from "@/lib/providers/vapi";
import { trackEvent } from "@/lib/telemetry";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
const ENDPOINT = "/api/webhooks/vapi";

function mapVapiStatus(eventType?: string): VoiceSessionStatus | null {
  if (!eventType) return null;
  const normalized = eventType.toLowerCase();
  if (normalized.includes("start") || normalized.includes("active")) {
    return VoiceSessionStatus.ACTIVE;
  }
  if (normalized.includes("end") || normalized.includes("complete")) {
    return VoiceSessionStatus.COMPLETED;
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return VoiceSessionStatus.FAILED;
  }
  return null;
}

function isJsonContentType(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("application/json");
}

function exceedsBodyLimit(request: NextRequest): boolean {
  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader) return false;
  const contentLength = Number(contentLengthHeader);
  return Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES;
}

export async function POST(request: NextRequest) {
  if (!isJsonContentType(request)) {
    logger.warn({ provider: "vapi", reason: "invalid_content_type" }, "Rejected webhook request");
    return fail("Unsupported content type", 415, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "vapi",
      retryable: false,
      mutation: true,
    });
  }

  if (exceedsBodyLimit(request)) {
    logger.warn({ provider: "vapi", reason: "payload_too_large_header" }, "Rejected webhook request");
    return fail("Payload too large", 413, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "vapi",
      retryable: false,
      mutation: true,
    });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    logger.warn({ provider: "vapi", reason: "payload_too_large_body" }, "Rejected webhook request");
    return fail("Payload too large", 413, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "vapi",
      retryable: false,
      mutation: true,
    });
  }

  const signature = request.headers.get("x-vapi-signature");

  if (!verifyVapiWebhook(rawBody, signature)) {
    logger.warn({ provider: "vapi", reason: "invalid_signature" }, "Rejected webhook request");
    return fail("Invalid webhook signature", 401, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "vapi",
      retryable: false,
      mutation: true,
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn({ provider: "vapi", reason: "invalid_json" }, "Rejected webhook request");
    return fail("Invalid JSON", 400, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "vapi",
      retryable: false,
      mutation: true,
    });
  }

  const eventId = String(payload.id ?? payload.messageId ?? payload.eventId ?? "");
  if (!eventId) {
    logger.warn({ provider: "vapi", reason: "missing_event_id" }, "Rejected webhook request");
    return fail("Missing event id", 400, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "vapi",
      retryable: false,
      mutation: true,
    });
  }

  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "vapi",
        eventId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  } catch {
    return ok({ duplicate: true }, 200, request);
  }

  const callData =
    payload.call && typeof payload.call === "object"
      ? (payload.call as Record<string, unknown>)
      : null;
  const providerSessionId = String(
    payload.callId ?? payload.sessionId ?? callData?.id ?? "",
  );
  const eventType = String(payload.type ?? payload.event ?? "");
  const mappedStatus = mapVapiStatus(eventType);

  if (providerSessionId && mappedStatus) {
    const sessions = await prisma.voiceSession.findMany({
      where: { providerSessionId },
    });

    for (const session of sessions) {
      const previousMeta =
        session.providerMeta && typeof session.providerMeta === "object"
          ? (session.providerMeta as Record<string, unknown>)
          : {};
      const mergedMeta = {
        ...previousMeta,
        latestWebhook: payload,
      };

      await prisma.voiceSession.update({
        where: { id: session.id },
        data: {
          status: mappedStatus,
          providerMeta: mergedMeta as Prisma.InputJsonValue,
        },
      });

      const flowTag = previousMeta.flow;
      if (flowTag === "flow4") {
        if (mappedStatus === VoiceSessionStatus.COMPLETED) {
          await trackUsage(session.userId, "FLOW4_COMPLETED", {
            sessionId: session.id,
          });
          await trackEvent(session.userId, "FLOW4_COMPLETED", {
            sessionId: session.id,
          });
        }

        if (mappedStatus === VoiceSessionStatus.FAILED) {
          await trackUsage(session.userId, "FLOW4_FAILED", {
            sessionId: session.id,
            code: "PROVIDER_ENRICHMENT_FAILED",
            provider: "vapi",
          });
          await trackEvent(session.userId, "FLOW4_FAILED", {
            sessionId: session.id,
            code: "PROVIDER_ENRICHMENT_FAILED",
            provider: "vapi",
          });
        }
      }
    }
  }

  logger.info(
    { eventId, providerSessionId, eventType },
    "Processed Vapi webhook event",
  );

  return ok({ received: true }, 200, request);
}
