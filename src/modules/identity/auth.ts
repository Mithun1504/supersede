import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { headers } from "next/headers";

import { getServerEnv, isWorkOSConfigured } from "@/lib/env/server";

export type AuthContext = {
  workosUserId: string;
  workosOrganizationId: string | null;
  email: string;
  displayName: string;
};

export async function getOptionalAuthContext(): Promise<AuthContext | null> {
  const env = getServerEnv();
  if (env.NODE_ENV !== "production" && env.E2E_AUTH_SECRET) {
    const requestHeaders = await headers();
    const workosUserId = requestHeaders.get("x-supersede-e2e-user");
    if (
      requestHeaders.get("x-supersede-e2e-key") === env.E2E_AUTH_SECRET &&
      workosUserId
    ) {
      return {
        workosUserId,
        workosOrganizationId: requestHeaders.get(
          "x-supersede-e2e-organization",
        ),
        email: "e2e@supersede.local",
        displayName:
          requestHeaders.get("x-supersede-e2e-name") ?? "E2E governed actor",
      };
    }
  }
  if (!isWorkOSConfigured()) {
    return null;
  }

  const auth = await withAuth();

  if (!auth.user) {
    return null;
  }

  const displayName =
    [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") ||
    auth.user.email;

  return {
    workosUserId: auth.user.id,
    workosOrganizationId: auth.organizationId ?? null,
    email: auth.user.email,
    displayName,
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const auth = await withAuth({ ensureSignedIn: true });

  return {
    workosUserId: auth.user.id,
    workosOrganizationId: auth.organizationId ?? null,
    email: auth.user.email,
    displayName:
      [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") ||
      auth.user.email,
  };
}
