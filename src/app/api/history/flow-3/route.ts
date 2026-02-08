import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { trackUsage } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { failWithCode, ok } from "@/lib/http";
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

  const [partnerProfiles, memoryAssets, cards] = await Promise.all([
    prisma.partnerProfile.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.memoryAsset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.cardProject.findMany({
      where: {
        userId: user.id,
        partnerProfileId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  await trackUsage(user.id, "FLOW3_STARTED", {
    partnerProfiles: partnerProfiles.length,
    memoryAssets: memoryAssets.length,
    cards: cards.length,
  });
  await trackEvent(user.id, "FLOW3_STARTED", {
    partnerProfiles: partnerProfiles.length,
    memoryAssets: memoryAssets.length,
    cards: cards.length,
  });

  return ok({
    partner_profiles: partnerProfiles.map((profile) => ({
      ...profile,
      interests: Array.isArray(profile.interests)
        ? profile.interests.filter((item): item is string => typeof item === "string")
        : [],
      createdAt: profile.createdAt.toISOString(),
    })),
    memory_assets: memoryAssets.map((asset) => ({
      ...asset,
      createdAt: asset.createdAt.toISOString(),
    })),
    cards: cards.map((card) => ({
      ...card,
      createdAt: card.createdAt.toISOString(),
    })),
  });
}
