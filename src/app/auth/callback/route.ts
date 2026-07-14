import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";

import { AppError } from "@/lib/errors/app-error";
import { getRequestId, problemResponse } from "@/lib/api/responses";
import { isWorkOSConfigured } from "@/lib/env/server";

const authHandler = handleAuth({ returnPathname: "/app" });

export async function GET(request: NextRequest) {
  if (!isWorkOSConfigured()) {
    const requestId = getRequestId(request);
    return problemResponse(
      new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Authentication is not configured.",
        status: 503,
      }),
      requestId,
      request.nextUrl.pathname,
    );
  }

  return authHandler(request);
}
