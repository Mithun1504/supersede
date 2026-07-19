import type React from "react";

import {
  ProductShell,
  type ProductViewer,
} from "@/components/product/product-shell";
import { isWorkOSConfigured } from "@/lib/env/server";
import { signOutAction } from "@/modules/identity/actions";
import { getProductWorkspace } from "@/modules/product";

type ProductShellProps = Omit<
  React.ComponentProps<typeof ProductShell>,
  "viewer" | "viewerAction" | "workspace"
>;

export async function AuthenticatedProductShell(props: ProductShellProps) {
  const data = await getProductWorkspace();
  const viewer: ProductViewer = {
    displayName: data.viewer.displayName,
    organizationReady: data.viewer.organizationReady,
    authenticated: data.viewer.authenticated,
    authenticationAvailable: isWorkOSConfigured(),
  };

  return (
    <ProductShell
      {...props}
      viewer={viewer}
      workspace={{
        organizationName: data.organization.name,
        configuration: data.organization.configuration,
        changeReference: data.change.reference,
        reviewCount: data.claims.filter(
          (claim) =>
            claim.reviewStatus === "suggested" ||
            claim.reviewStatus === "needs_review",
        ).length,
      }}
      viewerAction={
        data.viewer.authenticated ? (
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
