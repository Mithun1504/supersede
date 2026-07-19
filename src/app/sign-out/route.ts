import { signOut } from "@workos-inc/authkit-nextjs";

import { getServerEnv, isWorkOSConfigured } from "@/lib/env/server";

export async function GET() {
  const returnTo = new URL(
    "/app",
    getServerEnv().NEXT_PUBLIC_APP_URL,
  ).toString();

  if (!isWorkOSConfigured()) {
    return Response.redirect(returnTo);
  }

  await signOut({ returnTo });
  return Response.redirect(returnTo);
}
