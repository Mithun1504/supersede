import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";

import { isWorkOSConfigured } from "@/lib/env/server";

export type AuthContext = {
  workosUserId: string;
  workosOrganizationId: string | null;
  email: string;
  displayName: string;
};

export async function getOptionalAuthContext(): Promise<AuthContext | null> {
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
