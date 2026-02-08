export type FlowErrorCode =
  | "AUTH_REQUIRED"
  | "PARTNER_PROFILE_REQUIRED"
  | "PROVIDER_CONFIG_MISSING"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_ENRICHMENT_FAILED"
  | "VALIDATION_ERROR";

export class FlowError extends Error {
  code: FlowErrorCode;
  retryable: boolean;
  status: number;
  provider?: string;
  details?: unknown;

  constructor(
    message: string,
    options: {
      code: FlowErrorCode;
      status: number;
      retryable: boolean;
      provider?: string;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "FlowError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.provider = options.provider;
    this.details = options.details;
  }
}

export function isFlowError(error: unknown): error is FlowError {
  return error instanceof FlowError;
}
