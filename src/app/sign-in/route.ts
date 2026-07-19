import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isWorkOSConfigured } from "@/lib/env/server";

export async function GET(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("returnTo");
  const returnTo =
    requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/app";

  if (!isWorkOSConfigured()) {
    const unavailableUrl = new URL("/sign-in/unavailable", request.url);
    unavailableUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(unavailableUrl);
  }

  return redirect(await getSignInUrl({ returnTo }));
}
