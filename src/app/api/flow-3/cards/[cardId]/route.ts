import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { failWithCode, ok } from "@/lib/http";

type Params = {
  params: Promise<{ cardId: string }>;
};

export async function GET(request: NextRequest, context: Params) {
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

  const { cardId } = await context.params;
  if (!cardId) {
    return failWithCode(
      {
        error: "cardId is required",
        code: "VALIDATION_ERROR",
        retryable: false,
      },
      400,
    );
  }

  const card = await prisma.cardProject.findFirst({
    where: {
      id: cardId,
      userId: user.id,
      partnerProfileId: { not: null },
    },
  });

  if (!card) {
    return failWithCode(
      {
        error: "card_id not found for current user",
        code: "VALIDATION_ERROR",
        retryable: false,
      },
      404,
    );
  }

  return ok({
    card_id: card.id,
    status: card.status,
    preview_url: card.previewUrl,
    error_message: card.errorMessage,
  });
}
