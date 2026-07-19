import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isWorkOSConfigured } from "@/lib/env/server";

const authHandler = handleAuth({ returnPathname: "/app" });

export async function GET(request: NextRequest) {
  if (!isWorkOSConfigured()) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return authHandler(request);
}
