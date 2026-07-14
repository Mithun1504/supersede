import { toProblemDetails } from "@/lib/api/problem-details";

export function getRequestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function jsonResponse<T>(
  data: T,
  requestId: string,
  init?: ResponseInit,
): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-request-id", requestId);

  return Response.json(data, { ...init, headers });
}

export function problemResponse(
  error: unknown,
  requestId: string,
  instance?: string,
): Response {
  const problem = toProblemDetails(error, requestId, instance);

  return jsonResponse(problem, requestId, {
    status: problem.status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  });
}
