import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import {
  logApiMutationFailure,
  withRequestIdHeader,
} from "@/lib/observability/request-context";
import { trackEvent } from "@/lib/telemetry";

export type ApiError = {
  error: string;
  code?: string;
  retryable?: boolean;
  provider?: string;
  details?: unknown;
};

type FailureMeta = {
  request?: Request;
  route?: string;
  userId?: string | null;
  code?: string;
  provider?: string;
  retryable?: boolean;
  mutation?: boolean;
};

const PROVIDER_ERROR_CODES = new Set([
  "PROVIDER_CONFIG_MISSING",
  "PROVIDER_TIMEOUT",
  "PROVIDER_ENRICHMENT_FAILED",
]);

function emitReliabilitySignals(meta: FailureMeta | undefined, status: number) {
  if (!meta?.code || !PROVIDER_ERROR_CODES.has(meta.code)) return;
  if (status < 500) return;

  void trackEvent("system", "PROVIDER_ERROR_RATE_SPIKE", {
    code: meta.code,
    provider: meta.provider ?? "unknown",
    route: meta.route ?? "unknown",
    retryable: meta.retryable ?? null,
    status,
  });
}

function shouldLogFailure(meta?: FailureMeta): boolean {
  if (!meta?.request) return false;
  if (typeof meta.mutation === "boolean") {
    return meta.mutation;
  }
  return meta.request.method.toUpperCase() !== "GET";
}

export function ok<T>(data: T, status = 200, request?: Request): NextResponse<T> {
  const response = NextResponse.json(data, { status });
  return withRequestIdHeader(response, request);
}

export function fail(
  error: string,
  status = 400,
  details?: unknown,
  meta?: FailureMeta,
): NextResponse<ApiError> {
  if (shouldLogFailure(meta)) {
    emitReliabilitySignals(meta, status);
    logApiMutationFailure({
      request: meta?.request,
      route: meta?.route,
      userId: meta?.userId,
      code: meta?.code,
      provider: meta?.provider,
      retryable: meta?.retryable,
      status,
      message: error,
      details,
    });
  }

  const response = NextResponse.json({ error, details }, { status });
  return withRequestIdHeader(response, meta?.request);
}

export function failWithCode(
  options: {
    error: string;
    code: string;
    retryable: boolean;
    provider?: string;
    details?: unknown;
  },
  status = 400,
  meta?: FailureMeta,
): NextResponse<ApiError> {
  if (shouldLogFailure(meta)) {
    emitReliabilitySignals(meta, status);
    logApiMutationFailure({
      request: meta?.request,
      route: meta?.route,
      userId: meta?.userId,
      code: options.code,
      provider: options.provider,
      retryable: options.retryable,
      status,
      message: options.error,
      details: options.details,
    });
  }

  const response = NextResponse.json(options, { status });
  return withRequestIdHeader(response, meta?.request);
}

export async function parseJson<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ data?: T; error?: NextResponse<ApiError> }> {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return {
        error: fail("Invalid request payload", 400, parsed.error.flatten(), {
          request,
          code: "VALIDATION_ERROR",
          mutation: request.method.toUpperCase() !== "GET",
        }),
      };
    }
    return { data: parsed.data };
  } catch (error) {
    return {
      error: fail("Malformed JSON body", 400, String(error), {
        request,
        code: "VALIDATION_ERROR",
        mutation: request.method.toUpperCase() !== "GET",
      }),
    };
  }
}

export function parseAuthHeader(header?: string | null): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
