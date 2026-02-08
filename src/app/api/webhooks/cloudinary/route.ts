import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { logger } from "@/lib/logger";
import { verifyCloudinaryWebhook } from "@/lib/providers/cloudinary";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const ENDPOINT = "/api/webhooks/cloudinary";

function extractUserIdFromFolder(folder?: string): string {
  if (!folder) return "";
  const matched = folder.match(/^valentine\/user-([a-zA-Z0-9_-]{8,128})(?:\/|$)/i);
  return matched?.[1] ?? "";
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

function isValidUserId(userId: string): boolean {
  return USER_ID_PATTERN.test(userId);
}

export async function POST(request: NextRequest) {
  if (!isJsonContentType(request)) {
    logger.warn(
      { provider: "cloudinary", reason: "invalid_content_type" },
      "Rejected webhook request",
    );
    return fail("Unsupported content type", 415, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  if (exceedsBodyLimit(request)) {
    logger.warn(
      { provider: "cloudinary", reason: "payload_too_large_header" },
      "Rejected webhook request",
    );
    return fail("Payload too large", 413, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    logger.warn(
      { provider: "cloudinary", reason: "payload_too_large_body" },
      "Rejected webhook request",
    );
    return fail("Payload too large", 413, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  const signature = request.headers.get("x-cld-signature");

  if (!verifyCloudinaryWebhook(rawBody, signature)) {
    logger.warn(
      { provider: "cloudinary", reason: "invalid_signature" },
      "Rejected webhook request",
    );
    return fail("Invalid webhook signature", 401, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn(
      { provider: "cloudinary", reason: "invalid_json" },
      "Rejected webhook request",
    );
    return fail("Invalid JSON", 400, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  const eventId = String(
    payload.notification_id ?? payload.asset_id ?? payload.public_id ?? "",
  );
  if (!eventId) {
    logger.warn(
      { provider: "cloudinary", reason: "missing_event_id" },
      "Rejected webhook request",
    );
    return fail("Missing event id", 400, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "cloudinary",
        eventId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  } catch {
    return ok({ duplicate: true }, 200, request);
  }

  const publicId = String(payload.public_id ?? "");
  const secureUrl = String(payload.secure_url ?? "");
  const resourceType = String(payload.resource_type ?? "image");
  const contextUserIdRaw = String(
    (payload.context as { user_id?: string } | undefined)?.user_id ?? "",
  );
  const contextUserId = contextUserIdRaw.trim();
  const folder = String(payload.folder ?? payload.asset_folder ?? "");
  const folderUserId = extractUserIdFromFolder(
    folder,
  );
  const userId = contextUserId || folderUserId;

  if (contextUserId && !isValidUserId(contextUserId)) {
    logger.warn(
      { provider: "cloudinary", reason: "invalid_context_user_id" },
      "Rejected webhook request",
    );
    return fail("Invalid user id context", 400, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  if (folder && !folderUserId) {
    logger.warn(
      { provider: "cloudinary", reason: "invalid_folder_user_id" },
      "Rejected webhook request",
    );
    return fail("Invalid folder format", 400, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  if (contextUserId && folderUserId && contextUserId !== folderUserId) {
    logger.warn(
      { provider: "cloudinary", reason: "mismatched_user_ids" },
      "Rejected webhook request",
    );
    return fail("Mismatched webhook user identifiers", 400, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  if (publicId && secureUrl && userId) {
    if (!isValidUserId(userId)) {
      logger.warn(
        { provider: "cloudinary", reason: "invalid_user_id_for_asset_write" },
        "Rejected webhook request",
      );
      return fail("Invalid user id", 400, undefined, {
        request,
        route: ENDPOINT,
        userId: null,
        code: "VALIDATION_ERROR",
        provider: "cloudinary",
        retryable: false,
        mutation: true,
      });
    }

    const existing = await prisma.memoryAsset.findFirst({
      where: {
        userId,
        cloudinaryId: publicId,
      },
    });

    if (!existing) {
      await prisma.memoryAsset.create({
        data: {
          userId,
          cloudinaryId: publicId,
          secureUrl,
          resourceType,
          metadata: payload as Prisma.InputJsonValue,
        },
      });
    }
  } else if (publicId && secureUrl) {
    logger.warn(
      { provider: "cloudinary", reason: "missing_user_id_for_asset_write" },
      "Rejected webhook request",
    );
    return fail("Missing user id for asset write", 400, undefined, {
      request,
      route: ENDPOINT,
      userId: null,
      code: "VALIDATION_ERROR",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }

  logger.info({ eventId, publicId }, "Processed Cloudinary webhook event");
  return ok({ received: true }, 200, request);
}
