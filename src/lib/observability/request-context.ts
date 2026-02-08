import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

type MutationFailureLogInput = {
  request?: Request;
  route?: string;
  userId?: string | null;
  code?: string;
  provider?: string;
  status: number;
  message: string;
  retryable?: boolean;
  details?: unknown;
};

function parseRouteFromRequest(request?: Request): string {
  if (!request) return "unknown";
  try {
    const url = new URL(request.url);
    return url.pathname;
  } catch {
    return "unknown";
  }
}

export function getRequestId(request?: Request): string | null {
  if (!request) return null;
  return request.headers.get("x-request-id");
}

export function withRequestIdHeader<T extends NextResponse>(
  response: T,
  request?: Request,
): T {
  const requestId = getRequestId(request);
  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }
  return response;
}

export function logApiMutationFailure(input: MutationFailureLogInput): void {
  const route = input.route ?? parseRouteFromRequest(input.request);
  const requestId = getRequestId(input.request);

  logger.error(
    {
      request_id: requestId,
      route,
      user_id: input.userId ?? null,
      code: input.code ?? null,
      provider: input.provider ?? null,
      status: input.status,
      retryable: input.retryable ?? null,
      details: input.details,
      message: input.message,
    },
    "API mutation failed",
  );
}
