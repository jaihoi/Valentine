import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRateLimit, requireUser, trackUsage } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import {
  getIdempotentReplayResponse,
  getRequestIdempotencyKey,
  maybeSaveIdempotentResponse,
} from "@/lib/idempotency";
import { fail, ok, parseJson } from "@/lib/http";
import { trackEvent } from "@/lib/telemetry";

const createAssetSchema = z.object({
  cloudinary_id: z.string().min(1),
  secure_url: z.string().url(),
  resource_type: z.enum(["image", "video", "raw"]).default("image"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ENDPOINT = "/api/media/assets";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;

  const assets = await prisma.memoryAsset.findMany({
    where: { userId: auth.user!.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return ok({ assets }, 200, request);
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;
  const flowId = request.headers.get("x-flow-id") ?? "";

  const limited = await requireRateLimit(`media-assets:${user.id}`, 20, 60_000, {
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

  const parsed = await parseJson(request, createAssetSchema);
  if (parsed.error) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      parsed.error,
    );
  }

  const payload = parsed.data!;
  const existing = await prisma.memoryAsset.findFirst({
    where: {
      userId: user.id,
      cloudinaryId: payload.cloudinary_id,
    },
  });
  if (existing) {
    return maybeSaveIdempotentResponse(
      user.id,
      ENDPOINT,
      idempotencyKey,
      fail("Asset already registered", 409, { asset_id: existing.id }, {
        request,
        route: ENDPOINT,
        userId: user.id,
        code: "VALIDATION_ERROR",
        retryable: false,
        mutation: true,
      }),
    );
  }

  const asset = await prisma.memoryAsset.create({
    data: {
      userId: user.id,
      cloudinaryId: payload.cloudinary_id,
      secureUrl: payload.secure_url,
      resourceType: payload.resource_type,
      metadata: (payload.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  await trackUsage(user.id, "MEMORY_ASSET_CREATED", {
    assetId: asset.id,
  });
  if (flowId === "flow3") {
    await trackUsage(user.id, "FLOW3_ASSET_REGISTERED", {
      assetId: asset.id,
      resourceType: asset.resourceType,
    });
    await trackEvent(user.id, "FLOW3_ASSET_REGISTERED", {
      assetId: asset.id,
      resourceType: asset.resourceType,
    });
  }

  return maybeSaveIdempotentResponse(
    user.id,
    ENDPOINT,
    idempotencyKey,
    ok({ asset }, 201, request),
  );
}
