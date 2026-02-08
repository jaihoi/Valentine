import { NextRequest } from "next/server";
import { evaluateReadiness } from "@/lib/health";
import { ok } from "@/lib/http";
import { trackEvent } from "@/lib/telemetry";

export async function GET(request: NextRequest) {
  const readiness = await evaluateReadiness();
  const status = readiness.status === "ready" ? 200 : 503;

  if (readiness.status === "not_ready") {
    await trackEvent("system", "DEPLOY_HEALTHCHECK_FAILED", {
      checks: readiness.checks,
    });
  }

  return ok(readiness, status, request);
}
