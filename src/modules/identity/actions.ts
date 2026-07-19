"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

import { getServerEnv, isWorkOSConfigured } from "@/lib/env/server";

export async function signOutAction() {
  if (isWorkOSConfigured()) {
    await signOut({
      returnTo: new URL("/app", getServerEnv().NEXT_PUBLIC_APP_URL).toString(),
    });
  }
}
