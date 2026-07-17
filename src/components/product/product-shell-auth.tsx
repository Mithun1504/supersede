import type React from "react";

import {
  ProductShell,
  type ProductViewer,
} from "@/components/product/product-shell";
import { signOutAction } from "@/modules/identity/actions";
import { getOptionalAuthContext } from "@/modules/identity/auth";

type ProductShellProps = React.ComponentProps<typeof ProductShell>;

export async function AuthenticatedProductShell(props: ProductShellProps) {
  const auth = await getOptionalAuthContext();
  const viewer: ProductViewer | null = auth
    ? {
        displayName: auth.displayName,
        organizationReady: Boolean(auth.workosOrganizationId),
      }
    : null;

  return (
    <ProductShell
      {...props}
      viewer={viewer}
      viewerAction={
        auth ? (
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md px-2 py-1 text-xs font-medium focus-visible:ring-3"
            >
              Sign out
            </button>
          </form>
        ) : null
      }
    />
  );
}
