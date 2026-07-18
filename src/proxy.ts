import {
  applyResponseHeaders,
  authkit,
  partitionAuthkitHeaders,
} from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createContentSecurityPolicy } from "@/lib/security/content-security-policy";

const cookiePassword = process.env.WORKOS_COOKIE_PASSWORD;
const authConfigured = Boolean(
  process.env.WORKOS_API_KEY &&
  process.env.WORKOS_CLIENT_ID &&
  cookiePassword &&
  cookiePassword.length >= 32,
);

export default async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
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
    },
  ],
};
