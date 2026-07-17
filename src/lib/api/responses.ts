import { toProblemDetails } from "@/lib/api/problem-details";
import { isAppError } from "@/lib/errors/app-error";

export function getRequestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function jsonResponse<T>(
  data: T,
  requestId: string,
  init?: ResponseInit,
): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  headers.set("x-request-id", requestId);

  return Response.json(data, { ...init, headers });
}

export function problemResponse(
  error: unknown,
  requestId: string,
  instance?: string,
): Response {
  const problem = toProblemDetails(error, requestId, instance);
  const headers = new Headers({
    "content-type": "application/problem+json; charset=utf-8",
  });
  if (isAppError(error) && error.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(error.retryAfterSeconds));
  }

  return jsonResponse(problem, requestId, {
    status: problem.status,
    headers,
  });
}
