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

  const [partnerProfiles, datePlans] = await Promise.all([
    prisma.partnerProfile.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.datePlan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  await trackUsage(user.id, "FLOW1_STARTED", {
    partnerProfiles: partnerProfiles.length,
    datePlans: datePlans.length,
  });
  await trackEvent(user.id, "FLOW1_STARTED", {
    partnerProfiles: partnerProfiles.length,
    datePlans: datePlans.length,
  });

  return ok({
    partner_profiles: partnerProfiles,
    date_plans: datePlans,
  });
}
