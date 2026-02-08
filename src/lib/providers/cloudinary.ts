import crypto from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { env } from "@/lib/env";
import { FlowError } from "@/lib/flow-errors";
import { withGlobalTimeout } from "@/lib/network";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET,
  );
}

export function createUploadSignature(folder: string) {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder,
    },
    env.CLOUDINARY_API_SECRET!,
  );

  return {
    timestamp,
    signature,
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    folder,
  };
}

export async function uploadAudioBuffer(buffer: Buffer, filename: string) {
  if (!isCloudinaryConfigured()) {
    return null;
  }

  const dataUri = `data:audio/mpeg;base64,${buffer.toString("base64")}`;
  const uploaded = await cloudinary.uploader.upload(dataUri, {
    folder: "valentine/voice-assets",
    resource_type: "video",
    public_id: filename,
    overwrite: true,
  });
  return uploaded;
}

type StrictUploadOptions = {
  timeoutMs?: number;
};

export async function uploadAudioBufferStrict(
  buffer: Buffer,
  filename: string,
  options: StrictUploadOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 6_000;

  if (!isCloudinaryConfigured()) {
    throw new FlowError("Cloudinary is not configured", {
      code: "PROVIDER_CONFIG_MISSING",
      status: 503,
      retryable: false,
      provider: "cloudinary",
    });
  }

  try {
    const dataUri = `data:audio/mpeg;base64,${buffer.toString("base64")}`;

    const uploaded = await withGlobalTimeout(
      () =>
        cloudinary.uploader.upload(dataUri, {
          folder: "valentine/voice-assets",
          resource_type: "video",
          public_id: filename,
          overwrite: true,
        }),
      timeoutMs,
      new FlowError(`Cloudinary upload timed out after ${timeoutMs}ms`, {
        code: "PROVIDER_TIMEOUT",
        status: 504,
        retryable: true,
        provider: "cloudinary",
      }),
    );

    if (!uploaded?.secure_url || !uploaded?.public_id) {
      throw new FlowError("Cloudinary returned incomplete upload payload", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "cloudinary",
      });
    }

    return uploaded;
  } catch (error) {
    if (error instanceof FlowError) {
      throw error;
    }

    throw new FlowError("Cloudinary upload failed", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      status: 502,
      retryable: true,
      provider: "cloudinary",
      details: String(error),
    });
  }
}

export function buildCardPreviewUrl(
  sourcePublicId: string,
  messageText: string,
): string | null {
  if (!isCloudinaryConfigured()) {
    return null;
  }

  const sanitizedText = messageText.slice(0, 90);
  return cloudinary.url(sourcePublicId, {
    secure: true,
    transformation: [
      { width: 1080, height: 1350, crop: "fill" },
      {
        overlay: {
          font_family: "Arial",
          font_size: 56,
          font_weight: "bold",
          text: sanitizedText,
        },
        color: "white",
        gravity: "south",
        y: 90,
      },
      { effect: "shadow:60" },
    ],
  });
}

export function verifyCloudinaryWebhook(
  body: string,
  signature: string | null,
): boolean {
  if (!env.CLOUDINARY_WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", env.CLOUDINARY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
