import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { LoadingRows } from "@/components/product/status";

export default function Loading() {
  return (
    <AuthenticatedProductShell
      active="overview"
      eyebrow="Loading"
      title="Loading product workspace"
      description="Preparing the seeded workflow state."
    >
      <LoadingRows />
    </AuthenticatedProductShell>
  );
}
