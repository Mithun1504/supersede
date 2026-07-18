import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { AppError } from "@/lib/errors/app-error";
import { getRequestId, problemResponse } from "@/lib/api/responses";
import { isWorkOSConfigured } from "@/lib/env/server";

export async function GET(request: Request) {
  if (!isWorkOSConfigured()) {
    return problemResponse(
      new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Authentication is not configured.",
        status: 503,
      }),
      getRequestId(request),
      new URL(request.url).pathname,
    );
  }

  const requestedReturnTo = new URL(request.url).searchParams.get("returnTo");
  const returnTo =
    requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : undefined;
  const signInUrl = await getSignInUrl(returnTo ? { returnTo } : {});
  redirect(signInUrl);
}
