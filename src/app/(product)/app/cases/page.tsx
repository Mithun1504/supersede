import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { divergenceCases } from "@/components/product/demo-data";
import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Divergence Cases",
};

export default function CasesPage() {
  return (
    <AuthenticatedProductShell
      active="cases"
      eyebrow="Divergence cases"
      title="Divergence cases"
      description="Cases are released only after expert sign-off and version locking; ambiguous cases are retired, not patched in flight."
      action={
        <Button asChild>
          <Link href="/app/probes" data-product-action="open-probe-runner">
            Open probe runner
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4">
        {divergenceCases.map((item) => (
          <Surface key={item.id}>
            <div className="grid gap-5 p-4 sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">{item.title}</h2>
                  <p className="text-muted-foreground font-mono text-xs">
                    {item.id}
                  </p>
                </div>
                <StatusPill
                  tone={
                    item.status.includes("Approved") ? "success" : "warning"
                  }
                >
                  {item.status}
                </StatusPill>
              </div>
              <p className="border-border rounded-lg border p-4 leading-7">
                {item.scenario}
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <Answer label="Old answer → retired" text={item.oldAnswer} />
                <Answer
                  label="New answer → approved"
                  text={item.newAnswer}
                  approved
                />
              </div>
            </div>
          </Surface>
        ))}
      </div>
      <Surface>
        <SectionTitle
          title="Approval invariant"
          detail="No case reaches a learner without an approval record tied to the exact case version."
        />
      </Surface>
    </AuthenticatedProductShell>
  );
}

function Answer({
  label,
  text,
  approved = false,
}: {
  label: string;
  text: string;
  approved?: boolean;
}) {
  return (
    <div
      className={
        approved
          ? "border-success/30 bg-success/10 rounded-lg border p-4"
          : "border-border rounded-lg border p-4"
      }
    >
      <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
        {label}
      </p>
      <p className="mt-3 text-sm leading-6">{text}</p>
    </div>
  );
}
