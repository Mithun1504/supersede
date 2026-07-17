import {
  applyResponseHeaders,
  authkit,
  partitionAuthkitHeaders,
} from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createContentSecurityPolicy } from "@/lib/security/content-security-policy";

const authConfigured = Boolean(
  process.env.WORKOS_API_KEY &&
  process.env.WORKOS_CLIENT_ID &&
  process.env.WORKOS_COOKIE_PASSWORD,
);

export default async function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    !authConfigured &&
    request.nextUrl.pathname.startsWith("/app")
  ) {
    return new NextResponse("Authentication is not configured.", {
      status: 503,
    });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
    process.env.R2_ENDPOINT
      ? new URL(process.env.R2_ENDPOINT).origin
      : process.env.R2_ACCOUNT_ID
        ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : undefined,
  );
  let requestHeaders = new Headers(request.headers);
  let responseHeaders: Headers | undefined;

  if (authConfigured) {
    const authkitResult = await authkit(request);
    const partitioned = partitionAuthkitHeaders(request, authkitResult.headers);
    requestHeaders = partitioned.requestHeaders;
    responseHeaders = partitioned.responseHeaders;
  }

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", contentSecurityPolicy);

  if (responseHeaders) {
    applyResponseHeaders(response, responseHeaders);
  }

  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api/inngest|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
