import "server-only";

import {
  checkRecentAuth,
  getTokenClaims,
  withAuth,
} from "@workos-inc/authkit-nextjs";

import { isWorkOSConfigured } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";

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
  const auth = await withAuth();

  if (!auth.user) {
    throw new AppError({
      code: "UNAUTHENTICATED",
      message: "Your session has expired. Sign in and try again.",
      status: 401,
    });
  }

  return {
    workosUserId: auth.user.id,
    workosOrganizationId: auth.organizationId ?? null,
    email: auth.user.email,
    displayName:
      [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") ||
      auth.user.email,
  };
}

export async function requireRecentAuthentication(
  maxAgeSeconds = 300,
): Promise<void> {
  const { isStale } = await checkRecentAuth({ maxAge: maxAgeSeconds });
  if (isStale) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Please authenticate again before making this sensitive change.",
      status: 403,
      detail: `Authentication must be less than ${maxAgeSeconds} seconds old.`,
    });
  }
}

export type AuthenticationAssurance = {
  authenticationAgeSeconds: number;
  mfaVerified: boolean;
};

export async function getAuthenticationAssurance(): Promise<AuthenticationAssurance> {
  const auth = await withAuth();
  if (!auth.user || !auth.accessToken) {
    throw new AppError({
      code: "UNAUTHENTICATED",
      message: "Your session has expired. Sign in and try again.",
      status: 401,
    });
  }

  const claims = await getTokenClaims<{
    auth_time?: number;
    amr?: string[];
    mfa?: boolean;
  }>(auth.accessToken);
  if (typeof claims.auth_time !== "number") {
    throw new AppError({
      code: "FORBIDDEN",
      message: "The session does not contain authentication assurance data.",
      status: 403,
    });
  }

  const authenticationAgeSeconds = Math.max(
    0,
    Math.floor(Date.now() / 1000) - claims.auth_time,
  );
  const methods = Array.isArray(claims.amr) ? claims.amr : [];
  return {
    authenticationAgeSeconds,
    mfaVerified:
      claims.mfa === true ||
      methods.some((method) => ["mfa", "otp", "totp"].includes(method)),
  };
}
