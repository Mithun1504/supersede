import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { changeEvent } from "@/components/product/demo-data";
import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill, WorkState } from "@/components/product/status";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Change Events",
};

export default function ChangesPage() {
  return (
    <AuthenticatedProductShell
      active="changes"
      eyebrow="Change events"
      title="Change events"
      description="The honest v1 path: a designated owner enters the source change and a second reviewer validates it before propagation runs."
      action={
        <Button asChild>
          <Link
            href="/app/blast-radius"
            data-product-action="view-blast-radius"
          >
            View blast radius
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <Surface>
        <div className="grid gap-6 p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="space-y-2">
              <p className="font-mono text-sm font-semibold">
                {changeEvent.id}
              </p>
              <h2 className="text-2xl font-semibold text-pretty">
                {changeEvent.title}
              </h2>
            </div>
            <StatusPill tone="success">{changeEvent.status}</StatusPill>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Rule label="Old rule (from)" text={changeEvent.oldRule} />
            <Rule label="New rule (to)" text={changeEvent.newRule} approved />
          </div>
          <div className="border-border grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
            <Info label="Entered by" value="Dr. A. Patel · 07/14 10:21" />
            <Info label="Validated by" value="Dr. J. Morgan · 07/14 11:03" />
            <Info label="Revision" value="REV-7731 · v3.1" />
          </div>
        </div>
      </Surface>

      <Surface>
        <SectionTitle
          title="Propagation chain"
          detail="Each transition writes an append-only audit event."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
          {[
            "Source change",
            "Rule updated",
            "Links propagated",
            "Artifacts impacted",
            "Remediation required",
          ].map((step) => (
            <div className="border-border rounded-lg border p-4" key={step}>
              <h3 className="font-semibold">{step}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                Versioned object recorded for this ChangeEvent.
              </p>
              <div className="mt-4">
                <WorkState label="Complete" />
              </div>
            </div>
          ))}
        </div>
      </Surface>
    </AuthenticatedProductShell>
  );
}

function Rule({
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
      <p className="mt-3 text-lg leading-8">{text}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}
