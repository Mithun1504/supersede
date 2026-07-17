"use client";

import { useEffect } from "react";

import { ProductShell } from "@/components/product/product-shell";
import { ErrorNotice } from "@/components/product/status";
import { Button } from "@/components/ui/button";

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ProductShell
      active="overview"
      eyebrow="Product workspace"
      title="The product workspace could not load"
      description="The seeded view failed before it could render. Retry the route; if it repeats, check the server log with the error digest."
      action={<Button onClick={reset}>Try again</Button>}
    >
      <ErrorNotice
        title="Rendering failed"
        detail={
          error.digest
            ? `Error digest: ${error.digest}`
            : "No digest was returned for this local error."
        }
      />
    </ProductShell>
  );
}
