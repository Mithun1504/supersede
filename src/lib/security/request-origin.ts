import { AppError } from "@/lib/errors/app-error";

export function assertSameOrigin(request: Request): void {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== expected || (fetchSite && fetchSite !== "same-origin"))
    throw new AppError({
      code: "FORBIDDEN",
      message: "Cross-origin mutation requests are not allowed.",
      status: 403,
    });
}
