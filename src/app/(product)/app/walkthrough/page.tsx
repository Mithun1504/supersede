import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, LockKeyhole, PlayCircle } from "lucide-react";

import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

const walkthroughSteps = [
  {
    label: "Claim review",
    href: "/app/review",
    timing: "0:45",
    detail:
      "Run GPT-5.6 extraction, inspect exact quotes, and show that confidence prioritizes rather than approves.",
  },
  {
    label: "Dependency graph",
    href: "/app/graph",
    timing: "0:35",
    detail:
      "Trace the reviewed source-to-claim-to-protocol-to-role path with uncertainty left visible.",
  },
  {
    label: "Change events",
    href: "/app/changes",
    timing: "0:35",
    detail:
      "Show the honest manual v1 entry and the required second-person validation lock.",
  },
  {
    label: "Blast radius",
    href: "/app/blast-radius",
    timing: "0:50",
    detail:
      "Walk the propagated impacts: rewrite required, peripheral mention, and potential role exposure.",
  },
  {
    label: "Divergence cases",
    href: "/app/cases",
    timing: "0:45",
    detail:
      "Approve one old-rule versus new-rule case and make the immutable version boundary explicit.",
  },
  {
    label: "Instinct probes",
    href: "/app/probes",
    timing: "1:10",
    detail:
      "Inspect persisted assignments, responses, remediation, and different-case rechecks.",
  },
  {
    label: "Audit",
    href: "/app/audit",
    timing: "0:40",
    detail:
      "Close on observable outcomes and download the independently checksummed evidence bundle.",
  },
] as const;

export const metadata: Metadata = {
  title: "Workspace Walkthrough",
};

export default async function WalkthroughPage() {
  const data = await getProductWorkspace();
  return (
    <AuthenticatedProductShell
      active="walkthrough"
      eyebrow={`${data.organization.name} walkthrough`}
      title="Read-only product walkthrough"
      description={`A read-only path through the current ${data.change.reference} database state.`}
    >
      <Surface className="border-primary/30 overflow-hidden">
        <div className="border-primary/15 bg-primary/5 flex items-center gap-2 border-b px-4 py-3 text-xs sm:px-6">
          <LockKeyhole className="text-primary size-4" />
          <strong>Public seeded walkthrough</strong>
          <span className="text-muted-foreground">
            Read-only · safe for public review because it uses fictional
            clinical content.
          </span>
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
                Presenter route · 5 minutes
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                One changed rule. Every downstream obligation accounted for.
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                The current workspace contains {data.claims.length} claims,{" "}
                {data.impacts.length} impacts, {data.cases.length} cases, and{" "}
                {data.probes.length} probe assignments. Live extraction writes
                new governed claim records into this same workflow.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/app/review">
                Start with live extraction
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </Surface>

      <Surface>
        <SectionTitle
          title="Five-minute path"
          detail="Follow the workflow in order, or open any surface directly."
        />
        <div className="border-border/70 flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          <span className="text-muted-foreground text-xs">
            Presenter progress
          </span>
          <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
            <div className="from-primary to-chart-2 h-full w-[14.285%] animate-pulse rounded-full bg-gradient-to-r shadow-[0_0_8px_rgba(110,68,255,0.3)]" />
          </div>
          <span className="font-mono text-xs font-semibold">
            1 / {walkthroughSteps.length}
          </span>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          {walkthroughSteps.map((step, index) => (
            <Link
              className="border-border/70 bg-card/40 hover:bg-card hover:border-primary/25 focus-visible:ring-ring group relative grid gap-3 rounded-xl border p-4 pl-14 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(83,50,160,0.06)] focus-visible:ring-3 sm:grid-cols-[180px_1fr_24px] sm:items-start sm:pl-16"
              href={step.href}
              key={step.href}
            >
              <span className="border-border bg-card text-muted-foreground group-hover:border-primary/30 group-hover:from-primary group-hover:to-chart-2 group-hover:text-primary-foreground absolute top-4 left-2 grid size-9 place-items-center rounded-full border bg-gradient-to-br text-xs font-bold shadow-sm transition-all duration-300 sm:top-5 sm:left-4">
                {index === 0 ? (
                  <PlayCircle className="text-primary group-hover:text-primary-foreground size-5 transition-colors duration-300" />
                ) : (
                  index + 1
                )}
              </span>
              <div>
                <StatusPill tone={index === 0 ? "success" : "plum"}>
                  Step {index + 1} · {step.timing}
                </StatusPill>
                <h2 className="group-hover:text-primary mt-3 text-base font-semibold transition-colors duration-200">
                  {step.label}
                </h2>
              </div>
              <p className="text-muted-foreground mt-1 text-sm leading-6 sm:mt-2">
                {step.detail}
              </p>
              <ArrowRight
                className="text-muted-foreground group-hover:text-primary mt-1 size-4 shrink-0 transition-all duration-300 group-hover:translate-x-1 sm:mt-2"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </Surface>
    </AuthenticatedProductShell>
  );
}
