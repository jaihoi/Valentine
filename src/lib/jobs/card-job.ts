import { CardStatus } from "@prisma/client";
import { trackUsage } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { buildCardPreviewUrl } from "@/lib/providers/cloudinary";
import { trackEvent } from "@/lib/telemetry";

const FALLBACK_CARD_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1080' height='1350'%3E%3Crect width='100%25' height='100%25' fill='%23F4D7D7'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='52' fill='%238C2E37'%3EValentine Card Preview%3C/text%3E%3C/svg%3E";

export function allowCardPreviewFallback(nodeEnv: string, isFlow3Card: boolean) {
  return !(nodeEnv === "production" && isFlow3Card);
}

export async function processCardProject(cardId: string): Promise<void> {
  await prisma.cardProject.update({
    where: { id: cardId },
    data: { status: CardStatus.PROCESSING, errorMessage: null },
  });

  let cardUserId: string | null = null;
  let isFlow3Card = false;

  try {
    const card = await prisma.cardProject.findUnique({
      where: { id: cardId },
      include: { assets: true },
    });

    if (!card) {
      throw new Error("Card project not found");
    }

    cardUserId = card.userId;
    isFlow3Card = Boolean(card.partnerProfileId);

    const primaryAsset = card.assets[0];
    if (!primaryAsset) {
      throw new Error("No memory assets linked to card project");
    }

    const transformedPreviewUrl = primaryAsset.cloudinaryId
      ? buildCardPreviewUrl(primaryAsset.cloudinaryId, card.messageText)
      : null;

    const previewUrl =
      transformedPreviewUrl ??
      (allowCardPreviewFallback(env.NODE_ENV, isFlow3Card)
        ? primaryAsset.secureUrl
        : null);

    if (!previewUrl) {
      throw new Error("Card preview rendering failed in strict production mode");
    }

    await prisma.cardProject.update({
      where: { id: cardId },
      data: {
        status: CardStatus.READY,
        previewUrl,
      },
    });

    if (isFlow3Card && cardUserId) {
      await trackUsage(cardUserId, "FLOW3_CARD_READY", {
        cardId: card.id,
      });
      await trackEvent(cardUserId, "FLOW3_CARD_READY", {
        cardId: card.id,
      });
    }
  } catch (error) {
    logger.error({ error, cardId }, "Card project processing failed");

    try {
      await prisma.cardProject.update({
        where: { id: cardId },
        data: {
          status: CardStatus.FAILED,
          errorMessage: String(error),
          previewUrl: allowCardPreviewFallback(env.NODE_ENV, isFlow3Card)
            ? FALLBACK_CARD_DATA_URI
            : null,
        },
      });
    } catch (persistError) {
      logger.error(
        { error: persistError, cardId },
        "Unable to persist card failure state",
      );
    }

    if (isFlow3Card && cardUserId) {
      await trackUsage(cardUserId, "FLOW3_FAILED", {
        cardId,
        code: "PROVIDER_ENRICHMENT_FAILED",
        provider: "cloudinary",
      });
      await trackEvent(cardUserId, "FLOW3_FAILED", {
        cardId,
        code: "PROVIDER_ENRICHMENT_FAILED",
        provider: "cloudinary",
      });
    }
  }
}
