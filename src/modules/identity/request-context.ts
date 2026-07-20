import "server-only";

import { resolveActorContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { getOptionalAuthContext } from "@/modules/identity/auth";

export async function requireRequestAuthentication() {
  const auth = await getOptionalAuthContext();
  if (!auth) {
    throw new AppError({
      code: "UNAUTHENTICATED",
      message: "Authentication is required.",
      status: 401,
    });
  }
  return auth;
}

export async function requireTenantActor() {
  const auth = await requireRequestAuthentication();
  const tenant = await resolveActorContext({
    workosOrganizationId: auth.workosOrganizationId,
    workosUserId: auth.workosUserId,
    email: auth.email,
    displayName: auth.displayName,
  });
  return { auth, tenant };
}
