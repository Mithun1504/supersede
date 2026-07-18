import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { ProbeDashboard } from "@/components/product/probe-dashboard";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export const metadata: Metadata = {
  title: "Instinct Probes",
};

export default async function ProbesPage() {
  const data = await getProductWorkspace();
  return (
    <AuthenticatedProductShell
      active="probes"
      eyebrow="Instinct probes"
      title="Instinct probes"
      description="Delivered cold, short, and specific. A probe measures one response under one wording at one time."
      action={
        <Button asChild>
          <Link href="/app/audit" data-product-action="view-audit">
            View audit
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <ProbeDashboard probes={data.probes} />
    </AuthenticatedProductShell>
  );
}
