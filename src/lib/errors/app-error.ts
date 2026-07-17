export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "DEPENDENCY_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor({
    code,
    message,
    status,
    detail,
    cause,
    retryAfterSeconds,
  }: {
    code: ErrorCode;
    message: string;
    status: number;
    detail?: string;
    cause?: unknown;
    retryAfterSeconds?: number;
  }) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
