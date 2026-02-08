import { GeneratedContentType } from "@prisma/client";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { trackUsage } from "@/lib/api/guards";
import { failWithCode, ok } from "@/lib/http";
import { prisma } from "@/lib/db";
import { trackEvent } from "@/lib/telemetry";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return failWithCode(
      {
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
        retryable: false,
      },
      401,
    );
  }

  const [partnerProfiles, letters, voiceAssets] = await Promise.all([
    prisma.partnerProfile.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.generatedContent.findMany({
      where: {
        userId: user.id,
        type: GeneratedContentType.LOVE_LETTER,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.voiceAsset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  await trackUsage(user.id, "FLOW2_STARTED", {
    partnerProfiles: partnerProfiles.length,
    letters: letters.length,
    voiceAssets: voiceAssets.length,
  });
  await trackEvent(user.id, "FLOW2_STARTED", {
    partnerProfiles: partnerProfiles.length,
    letters: letters.length,
    voiceAssets: voiceAssets.length,
  });

  return ok({
    partner_profiles: partnerProfiles,
    letters,
    voice_assets: voiceAssets,
  });
}
