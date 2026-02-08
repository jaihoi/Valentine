import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { trackUsage } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { failWithCode, ok } from "@/lib/http";
import { trackEvent } from "@/lib/telemetry";

function isFlow5GiftMeta(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as { flow?: unknown }).flow === "flow5";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

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

  const [partnerProfiles, giftRecommendations] = await Promise.all([
    prisma.partnerProfile.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.giftRecommendation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const sorted = [...giftRecommendations]
    .sort((a, b) => {
      const aPriority = isFlow5GiftMeta(a.providerMeta) ? 0 : 1;
      const bPriority = isFlow5GiftMeta(b.providerMeta) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 25);

  await trackUsage(user.id, "FLOW5_STARTED", {
    partnerProfiles: partnerProfiles.length,
    giftRecommendations: sorted.length,
  });
  await trackEvent(user.id, "FLOW5_STARTED", {
    partnerProfiles: partnerProfiles.length,
    giftRecommendations: sorted.length,
  });

  return ok({
    partner_profiles: partnerProfiles.map((profile) => ({
      ...profile,
      interests: normalizeStringArray(profile.interests),
      createdAt: profile.createdAt.toISOString(),
    })),
    gift_recommendations: sorted.map((gift) => ({
      ...gift,
      interests: normalizeStringArray(gift.interests),
      recommendations: Array.isArray(gift.recommendations)
        ? gift.recommendations
        : [],
      links: normalizeStringArray(gift.links),
      providerMeta:
        gift.providerMeta && typeof gift.providerMeta === "object"
          ? (gift.providerMeta as Record<string, unknown>)
          : undefined,
      createdAt: gift.createdAt.toISOString(),
    })),
  });
}
