import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { LoadingRows } from "@/components/product/status";

export default function Loading() {
  return (
    <AuthenticatedProductShell
      active="overview"
      eyebrow="Loading"
      title="Loading product workspace"
      description="Loading the current workflow state from the database."
    >
      <LoadingRows />
    </AuthenticatedProductShell>
  );
}
