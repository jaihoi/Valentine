import * as Sentry from "@sentry/nextjs";
import { PostHog } from "posthog-node";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

let posthogClient: PostHog | null = null;

if (env.POSTHOG_API_KEY) {
  posthogClient = new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  logger.error({ error, context }, "Unhandled error");
  if (env.SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context,
      tags: {
        release:
          env.SENTRY_RELEASE ??
          process.env.VERCEL_GIT_COMMIT_SHA ??
          process.env.GITHUB_SHA ??
          "local",
      },
    });
  }
}

export async function trackEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
) {
  if (!posthogClient) return;
  await posthogClient.capture({
    distinctId,
    event,
    properties,
  });
}
