import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";

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
      "Run the declared R.N. Adams simulation, correct the artifact, and schedule a different-case recheck.",
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
  title: "Seeded Walkthrough",
};

export default function WalkthroughPage() {
  return (
    <AuthenticatedProductShell
      active="walkthrough"
      eyebrow="Public seeded walkthrough"
      title="Read-only product walkthrough"
      description="A seeded path through the demo data. It is safe for public review because it uses fictional clinical content and scripted personas."
    >
      <Surface className="border-primary/30 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
              Presenter route · 5 minutes
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              One changed rule. Every downstream obligation accounted for.
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              Live extraction is the completion gate. Corpus, clinical content,
              personas, and response patterns are fictional and visibly seeded;
              the governance boundaries are the real product.
            </p>
          </div>
          <Button asChild>
            <Link href="/app/review">
              Start with live extraction
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Surface>

      <Surface>
        <SectionTitle
          title="Five-minute path"
          detail="Follow the workflow in order, or open any surface directly."
        />
        <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">
          {walkthroughSteps.map((step, index) => (
            <Link
              className="border-border hover:border-primary focus-visible:ring-ring group rounded-lg border p-4 transition-colors duration-150 focus-visible:ring-3"
              href={step.href}
              key={step.href}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <StatusPill tone="plum">
                    Step {index + 1} · {step.timing}
                  </StatusPill>
                  <h2 className="mt-3 text-lg font-semibold">{step.label}</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {step.detail}
                  </p>
                </div>
                <ArrowRight
                  className="text-muted-foreground group-hover:text-primary mt-1 size-4 shrink-0"
                  aria-hidden="true"
                />
              </div>
            </Link>
          ))}
        </div>
      </Surface>
    </AuthenticatedProductShell>
  );
}
