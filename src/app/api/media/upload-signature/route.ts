import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRateLimit, requireUser } from "@/lib/api/guards";
import { createUploadSignature } from "@/lib/providers/cloudinary";
import { fail, ok } from "@/lib/http";

const querySchema = z.object({
  subfolder: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-_/]+$/i)
    .optional(),
});
const ENDPOINT = "/api/media/upload-signature";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const user = auth.user!;

  const limited = await requireRateLimit(
    `media-upload-signature:${user.id}`,
    30,
    60_000,
    {
      request,
      route: ENDPOINT,
      userId: user.id,
    },
  );
  if (limited) return limited;

  const parsedQuery = querySchema.safeParse({
    subfolder: request.nextUrl.searchParams.get("subfolder") ?? undefined,
  });
  if (!parsedQuery.success) {
    return fail("Invalid query parameters", 400, parsedQuery.error.flatten(), {
      request,
      route: ENDPOINT,
      userId: user.id,
      code: "VALIDATION_ERROR",
      retryable: false,
      mutation: true,
    });
  }

  try {
    const folder = `valentine/user-${user.id}/${
      parsedQuery.data.subfolder ?? "memory-assets"
    }`;
    const signature = createUploadSignature(folder);
    return ok({
      cloudinary_signature: signature.signature,
      timestamp: signature.timestamp,
      folder: signature.folder,
      cloud_name: signature.cloudName,
      api_key: signature.apiKey,
    }, 200, request);
  } catch (error) {
    return fail("Cloudinary configuration missing", 500, String(error), {
      request,
      route: ENDPOINT,
      userId: user.id,
      code: "PROVIDER_CONFIG_MISSING",
      provider: "cloudinary",
      retryable: false,
      mutation: true,
    });
  }
}
