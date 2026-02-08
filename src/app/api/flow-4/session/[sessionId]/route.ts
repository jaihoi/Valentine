import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { failWithCode, ok } from "@/lib/http";

type Params = {
  params: Promise<{ sessionId: string }>;
};

function isFlow4SessionMeta(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const maybeFlow = (value as { flow?: unknown }).flow;
  return maybeFlow === "flow4";
}

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

  const { sessionId } = await context.params;
  if (!sessionId) {
    return failWithCode(
      {
        error: "sessionId is required",
        code: "VALIDATION_ERROR",
        retryable: false,
      },
      400,
    );
  }

  const session = await prisma.voiceSession.findFirst({
    where: {
      id: sessionId,
      userId: user.id,
    },
  });

  if (!session || !isFlow4SessionMeta(session.providerMeta)) {
    return failWithCode(
      {
        error: "session_id not found for current user",
        code: "VALIDATION_ERROR",
        retryable: false,
      },
      404,
    );
  }

  return ok({
    session_id: session.id,
    call_link_or_number: session.callLinkOrNumber,
    status: session.status,
    updated_at: session.updatedAt.toISOString(),
    provider_meta:
      session.providerMeta && typeof session.providerMeta === "object"
        ? (session.providerMeta as Record<string, unknown>)
        : undefined,
  });
}
