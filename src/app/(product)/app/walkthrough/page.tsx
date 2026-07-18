import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";

import { workflowNav } from "@/components/product/product-navigation";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

const guideNotes = {
  review: {
    timing: "0:45",
    check:
      "Inspect exact source quotes and show that model confidence sets review priority—not approval.",
  },
  graph: {
    timing: "0:35",
    check:
      "Follow the validated source-to-claim-to-artifact-to-role path with uncertainty and ownership visible.",
  },
  changes: {
    timing: "0:35",
    check:
      "Compare the two source versions and verify the required second-person validation boundary before propagation.",
  },
  "blast-radius": {
    timing: "0:50",
    check:
      "Triage each affected artifact, its owner, rewrite obligation, and potential role exposure.",
  },
  cases: {
    timing: "0:45",
    check:
      "Review a cited case where the old and new rules disagree, then inspect its immutable version.",
  },
  probes: {
    timing: "1:10",
    check:
      "Read the observable sequence from assignment through remediation and a different-case recheck.",
  },
  audit: {
    timing: "0:40",
    check:
      "Verify actors, approvals, event history, retention mode, and the export checksum.",
  },
} as const;

const guideSteps = workflowNav
  .filter((item) => item.step !== null)
  .map((item) => ({
    ...item,
    ...guideNotes[item.key as keyof typeof guideNotes],
  }));

export const metadata: Metadata = {
  title: "Demo Guide",
};

export default async function WalkthroughPage() {
  const data = await getProductWorkspace();
  const reviewState = data.change.validatedAt
    ? "Second review complete"
    : "Awaiting second reviewer";

  return (
    <AuthenticatedProductShell
      active="walkthrough"
      title="Demo guide"
      description={`A public, read-only route through the fictional ${data.organization.name} dossier.`}
    >
      <section
        aria-labelledby="demo-dossier-title"
        className="border-border bg-card overflow-hidden border"
      >
        <div className="border-border flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2 text-sm font-bold">
            <LockKeyhole className="text-primary size-4" aria-hidden="true" />
            Public demo record
          </div>
          <p className="text-muted-foreground text-xs leading-5">
            Fictional clinical content · No mutations · No real people
          </p>
        </div>

        <div className="grid gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.5fr)] lg:gap-12 lg:py-8">
          <div>
            <p className="text-primary text-xs font-bold tracking-[0.1em] uppercase">
              Presenter route · 5 minutes
            </p>
            <h2
              id="demo-dossier-title"
              className="mt-3 max-w-2xl text-2xl font-semibold sm:text-3xl"
            >
              One source revision. Every downstream obligation accounted for.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-6">
              Begin with the source evidence, follow the dependency path, and
              finish at the independently checkable audit packet. The guide
              explains the workflow; it does not change governed records.
            </p>
            <Button asChild className="mt-6" size="lg">
              <Link href="/app/review">
                Begin at evidence intake
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <dl className="border-border divide-border divide-y border-y">
            <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-3 text-sm">
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="font-mono text-xs font-semibold break-all">
                {data.change.reference}
              </dd>
            </div>
            <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-3 text-sm">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="font-semibold">{data.change.sourceTitle}</dd>
            </div>
            <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-3 text-sm">
              <dt className="text-muted-foreground">Review state</dt>
              <dd className="font-semibold">{reviewState}</dd>
            </div>
            <div className="grid grid-cols-[7.5rem_1fr] gap-4 py-3 text-sm">
              <dt className="text-muted-foreground">Configuration</dt>
              <dd className="font-semibold capitalize">
                {data.organization.configuration}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="guide-title" className="mt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-primary text-xs font-bold tracking-[0.1em] uppercase">
              Read-only route
            </p>
            <h2 id="guide-title" className="mt-2 text-2xl font-semibold">
              Follow the working order
            </h2>
          </div>
          <p className="text-muted-foreground max-w-md text-sm leading-6 sm:text-right">
            Each stop names the reviewer decision to inspect, not a feature to
            click through.
          </p>
        </div>

        <ol className="border-border mt-5 border-t">
          {guideSteps.map((step) => (
            <li className="border-border border-b" key={step.key}>
              <Link
                className="group focus-visible:ring-ring grid gap-3 py-5 focus-visible:ring-3 sm:grid-cols-[3rem_11rem_3.5rem_1fr_auto] sm:items-baseline sm:gap-4"
                href={step.href}
              >
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {String(step.step).padStart(2, "0")}
                </span>
                <span className="font-heading text-lg font-semibold">
                  {step.label}
                </span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {step.timing}
                </span>
                <span className="text-muted-foreground text-sm leading-6">
                  {step.check}
                </span>
                <ArrowRight
                  className="text-muted-foreground group-hover:text-primary hidden size-4 transition-[color,transform] duration-150 group-hover:translate-x-0.5 sm:block"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-border bg-secondary/55 mt-6 border px-4 py-5 sm:px-6">
        <h2 className="text-base font-semibold">
          What this guide does not prove
        </h2>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">
          It does not certify clinical correctness, infer an individual mental
          state, or represent a production deployment. It shows the seeded
          workflow and its observable evidence boundaries.
        </p>
      </section>
    </AuthenticatedProductShell>
  );
}
