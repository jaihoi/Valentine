import { Prisma, type GiftRecommendation } from "@prisma/client";
import { generateGiftRecommendationsStrict } from "@/lib/ai/orchestrator";
import { FlowError } from "@/lib/flow-errors";
import { moderateText } from "@/lib/moderation";
import { prisma } from "@/lib/db";

type StrictGiftServiceInput = {
  userId: string;
  partnerProfileId?: string;
  interests: string[];
  budget: number;
  constraints?: string;
  flowTag: "flow5" | "legacy-gifts";
};

type StrictGiftServiceResult = {
  saved: GiftRecommendation;
  gift: {
    recommendations: Array<{
      title: string;
      reason: string;
      estimated_price: number;
    }>;
    explanation: string;
    links: string[];
  };
  sources: {
    perplexity_links: string[];
    firecrawl_extracts_count: number;
  };
};

export async function createStrictGiftRecommendation(
  input: StrictGiftServiceInput,
): Promise<StrictGiftServiceResult> {
  const strict = await generateGiftRecommendationsStrict({
    interests: input.interests,
    budget: input.budget,
    constraints: input.constraints,
    partner_profile_id: input.partnerProfileId,
  });

  const moderation = await moderateText(strict.gift.explanation);
  if (!moderation.allowed) {
    throw new FlowError("Generated content blocked by moderation", {
      code: "VALIDATION_ERROR",
      status: 422,
      retryable: false,
      provider: "moderation",
      details: moderation.reason,
    });
  }

  const saved = await prisma.giftRecommendation.create({
    data: {
      userId: input.userId,
      partnerProfileId: input.partnerProfileId,
      interests: input.interests as Prisma.InputJsonValue,
      budget: input.budget,
      constraints: input.constraints,
      recommendations: strict.gift.recommendations as Prisma.InputJsonValue,
      explanation: strict.gift.explanation,
      links: strict.gift.links as Prisma.InputJsonValue,
      providerMeta: {
        ...strict.providerMeta,
        ...strict.sources,
        flow: input.flowTag,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    saved,
    gift: strict.gift,
    sources: strict.sources,
  };
}
