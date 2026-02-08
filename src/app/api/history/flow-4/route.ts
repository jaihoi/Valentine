import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { trackUsage } from "@/lib/api/guards";
import { prisma } from "@/lib/db";
import { failWithCode, ok } from "@/lib/http";
import { trackEvent } from "@/lib/telemetry";

function isFlow4SessionMeta(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as { flow?: unknown }).flow === "flow4";
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

  const [partnerProfiles, sessions] = await Promise.all([
    prisma.partnerProfile.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.voiceSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const flow4Sessions = sessions.filter((session) =>
    isFlow4SessionMeta(session.providerMeta),
  );

  await trackUsage(user.id, "FLOW4_STARTED", {
    partnerProfiles: partnerProfiles.length,
    voiceSessions: flow4Sessions.length,
  });
  await trackEvent(user.id, "FLOW4_STARTED", {
    partnerProfiles: partnerProfiles.length,
    voiceSessions: flow4Sessions.length,
  });

  return ok({
    partner_profiles: partnerProfiles.map((profile) => ({
      ...profile,
      interests: Array.isArray(profile.interests)
        ? profile.interests.filter((item): item is string => typeof item === "string")
        : [],
      createdAt: profile.createdAt.toISOString(),
    })),
    voice_sessions: flow4Sessions.slice(0, 25).map((session) => ({
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      providerMeta:
        session.providerMeta && typeof session.providerMeta === "object"
          ? (session.providerMeta as Record<string, unknown>)
          : undefined,
    })),
  });
}
