import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Quote } from "lucide-react";

import { changeEvent, reviewItems } from "@/components/product/demo-data";
import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import {
  ConfidenceBar,
  ErrorNotice,
  StatusPill,
  WorkState,
} from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { LiveExtractionPanel } from "@/components/product/live-extraction-panel";

export const metadata: Metadata = {
  title: "Claim Review",
};

export default function ReviewPage() {
  return (
    <AuthenticatedProductShell
      active="review"
      eyebrow="Claim review"
      title="Evidence review queue"
      description="Review extracted claims, quoted spans, and edge confidence before accepting the propagation graph."
      action={
        <Button asChild>
          <Link href="/app/graph" data-product-action="open-graph">
            Open graph
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <LiveExtractionPanel />
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Surface>
          <SectionTitle
            title="Claims needing reviewer attention"
            detail="The seeded queue keeps uncertainty visible instead of silently promoting weak links."
          />
          <div className="divide-border divide-y">
            {reviewItems.map((item) => (
              <article
                className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_180px]"
                key={item.claim}
              >
                <div className="min-w-0 space-y-2">
                  <StatusPill
                    tone={item.status.includes("Conflicts") ? "danger" : "plum"}
                  >
                    {item.status}
                  </StatusPill>
                  <h2 className="text-lg font-semibold text-pretty">
                    {item.claim}
                  </h2>
                  <p className="text-muted-foreground text-sm">{item.source}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
                    Confidence
                  </p>
                  <ConfidenceBar value={item.confidence} />
                </div>
              </article>
            ))}
          </div>
        </Surface>
        <Surface>
          <SectionTitle
            title="Selected quote"
            detail="Exact evidence shown to reviewers."
          />
          <div className="space-y-4 p-4 sm:p-6">
            <Quote className="text-primary size-5" aria-hidden="true" />
            <blockquote className="text-lg leading-8 text-pretty">
              “{changeEvent.citation}”
            </blockquote>
            <p className="text-muted-foreground font-mono text-xs">
              ACG Clinical Guideline v3.1 · pages 24-25
            </p>
            <WorkState label="Validated 07/14 11:03 ET" />
          </div>
        </Surface>
      </section>

      <ErrorNotice
        title="One edge is below the acceptance threshold"
        detail="Review the conflicting pre-endoscopy bolus claim or mark it as overridden with a recorded reason before release authorization."
      />
    </AuthenticatedProductShell>
  );
}
