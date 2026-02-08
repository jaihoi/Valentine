import { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/http";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const userId = auth.user!.id;

  const [datePlans, giftRecommendations, generatedContents, voiceAssets, cards, sessions] =
    await Promise.all([
      prisma.datePlan.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.giftRecommendation.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.generatedContent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.voiceAsset.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.cardProject.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.voiceSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  return ok({
    datePlans,
    giftRecommendations,
    generatedContents,
    voiceAssets,
    cards,
    sessions,
  });
}
