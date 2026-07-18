import Link from "next/link";
import type { Metadata } from "next";
import type React from "react";
import {
  ArrowRight,
  Check,
  FileInput,
  GitCommitHorizontal,
  ShieldCheck,
} from "lucide-react";

import { Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { SplitRule, WorkflowRail } from "@/components/product/product-ui";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export const metadata: Metadata = { title: "Change Events" };

export default async function ChangesPage() {
  const data = await getProductWorkspace();
  return (
    <AuthenticatedProductShell
      active="changes"
      eyebrow="Change events"
      title="Change events"
      description="A designated owner enters each source change and a second reviewer validates it before propagation runs."
      action={
        <Button asChild>
          <Link href="/app/blast-radius">
            View blast radius
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4">
        {data.changes.map((change) => (
          <Surface key={change.versionId} className="overflow-hidden">
            <div className="p-4 sm:p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <p className="font-mono text-sm font-semibold">
                    {change.reference} · {change.versionLabel}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    {change.sourceTitle}
                  </h2>
                </div>
                <StatusPill tone={change.validatedAt ? "success" : "warning"}>
                  {change.validatedAt ? "Validated" : "Pending validation"}
                </StatusPill>
              </div>
              <div className="relative mt-5 grid overflow-hidden rounded-xl border lg:grid-cols-2">
                <SplitRule label="Old rule (from)" text={change.oldRule} />
                <span className="border-border bg-card absolute top-1/2 left-1/2 z-10 hidden size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border lg:grid">
                  <ArrowRight className="size-4" />
                </span>
                <SplitRule
                  label="New rule (to)"
                  text={change.newRule}
                  current
                />
              </div>
              <div className="border-border/70 mt-5 grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
                <Info
                  label="Entered by"
                  value={`${change.enteredBy} · ${formatDate(change.enteredAt)}`}
                  icon={FileInput}
                  tone="cyan"
                />
                <Info
                  label="Validated by"
                  value={
                    change.validatedBy
                      ? `${change.validatedBy} · ${formatDate(change.validatedAt)}`
                      : "Pending"
                  }
                  icon={ShieldCheck}
                  tone="success"
                />
                <Info
                  label="Downstream impacts"
                  value={String(change.impactCount)}
                  icon={GitCommitHorizontal}
                  tone="violet"
                />
              </div>
            </div>
            <div className="border-border/70 bg-muted/20 border-t p-4 sm:p-6">
              <p className="eyebrow mb-4">Governed lifecycle</p>
              <WorkflowRail
                steps={[
                  {
                    title: "Entered",
                    detail: formatDate(change.enteredAt),
                    state: "complete",
                    icon: FileInput,
                  },
                  {
                    title: "Second reviewer",
                    detail: change.validatedBy ?? "Pending",
                    state: change.validatedAt ? "complete" : "current",
                    icon: ShieldCheck,
                  },
                  {
                    title: "Validated",
                    detail: formatDate(change.validatedAt),
                    state: change.validatedAt ? "complete" : "pending",
                    icon: Check,
                  },
                  {
                    title: "Propagation",
                    detail: `${change.impactCount} downstream impacts`,
                    state: change.impactCount > 0 ? "current" : "pending",
                    icon: GitCommitHorizontal,
                  },
                ]}
              />
            </div>
          </Surface>
        ))}
      </div>
    </AuthenticatedProductShell>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Pending";
}
function Info({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "cyan" | "success" | "violet";
}) {
  const tones = {
    cyan: "bg-signal-cyan/12 text-signal-cyan border-signal-cyan/20",
    success: "bg-success/12 text-success border-success/20",
    violet: "bg-signal-violet/12 text-signal-violet border-signal-violet/20",
  } as const;
  return (
    <div className="flex items-start gap-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl border ${tones[tone]}`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="data-label">{label}</p>
        <p className="mt-1.5 text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
