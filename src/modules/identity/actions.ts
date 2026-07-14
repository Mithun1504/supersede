"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

import { isWorkOSConfigured } from "@/lib/env/server";
import { requireAuthContext } from "@/modules/identity/auth";

export async function signOutAction() {
  if (isWorkOSConfigured()) {
    await requireAuthContext();
    await signOut();
  }
}
