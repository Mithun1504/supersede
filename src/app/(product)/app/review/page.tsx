import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, FileSearch, Quote, ShieldCheck } from "lucide-react";

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
import { getProductWorkspace } from "@/modules/product";
import { getConfigurationStatus } from "@/lib/env/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Claim Review",
};

export default async function ReviewPage() {
  const data = await getProductWorkspace();
  const configuration = getConfigurationStatus();
  const selected = data.claims[0];
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
      <LiveExtractionPanel
        authenticated={data.viewer.authenticated}
        organizationReady={data.viewer.organizationReady}
        openAiConfigured={configuration.openai}
      />
      <Surface className="overflow-hidden">
        <section className="grid min-w-0 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
          {/* Column 1: Evidence Document */}
          <div className="border-border/70 bg-card/10 min-w-0 border-b p-4 sm:p-5 lg:border-r lg:border-b-0">
            <SectionTitle
              title="Evidence document"
              detail="Extracted source citations."
            />
            <div className="mt-4 space-y-4">
              <div className="bg-card border-border/60 flex items-center gap-3 rounded-xl border p-4 shadow-xs">
                <FileSearch className="text-primary size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {selected?.artifactTitle ?? "No evidence selected"}
                  </p>
                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {selected?.evidenceLocation ?? "N/A"}
                  </p>
                </div>
              </div>
              <div className="border-primary/20 bg-primary/5 rounded-xl border p-4">
                <p className="text-primary inline-flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="size-4" />
                  Governed workflow
                </p>
                <p className="text-muted-foreground mt-2 text-xs leading-5">
                  Decisions are version locked and require authenticated human
                  validation.
                </p>
              </div>
            </div>
          </div>

          {/* Column 2: Review Queue */}
          <div className="min-w-0 border-b lg:border-r lg:border-b-0">
            <SectionTitle
              title="Claims needing reviewer attention"
              detail="Uncertainty remains visible instead of silently promoting weak links."
            />
            <div className="flex flex-col gap-3 p-4 sm:p-5">
              {data.claims.map((item) => (
                <article
                  className={cn(
                    "border-border/70 bg-card/45 hover:bg-card hover:border-primary/25 flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(83,50,160,0.05)]",
                    item.versionId === selected?.versionId &&
                      "border-primary/35 bg-card ring-primary/20 shadow-[0_8px_30px_rgba(83,50,160,0.04)] ring-1",
                  )}
                  key={item.versionId}
                >
                  <div className="min-w-0 space-y-2">
                    <StatusPill
                      tone={
                        item.reviewStatus === "needs_review"
                          ? "danger"
                          : item.reviewStatus === "reviewed"
                            ? "success"
                            : "plum"
                      }
                    >
                      {item.reviewStatus.replaceAll("_", " ")}
                    </StatusPill>
                    <h3 className="text-sm leading-snug font-semibold text-pretty">
                      {item.text}
                    </h3>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                      Confidence
                    </span>
                    <ConfidenceBar value={Math.round(item.confidence * 100)} />
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* Column 3: Claim Inspector */}
          <aside className="bg-card/10 min-w-0 p-4 sm:p-5">
            <SectionTitle
              title="Claim inspector"
              detail="Inspect exact quote evidence."
            />
            {selected ? (
              <div className="mt-4 space-y-5">
                <div className="border-primary/50 bg-card border-border/60 rounded-r-xl border border-l-4 p-4 shadow-sm transition-all duration-200">
                  <Quote
                    className="text-primary size-5 opacity-60"
                    aria-hidden="true"
                  />
                  <blockquote className="text-foreground mt-2 text-sm leading-relaxed font-medium text-pretty italic">
                    “{selected.evidenceQuote}”
                  </blockquote>
                  <p className="text-muted-foreground mt-3 font-mono text-[10px]">
                    {selected.key} · {selected.versionLabel}
                  </p>
                </div>

                <div className="bg-card border-border/60 space-y-3 rounded-xl border p-4 shadow-xs">
                  <div>
                    <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                      Match Rationale
                    </span>
                    <p className="text-muted-foreground mt-1 text-xs leading-5">
                      {selected.rationale ?? "No rationale specified."}
                    </p>
                  </div>
                  <div className="border-border/60 flex items-center justify-between gap-3 border-t pt-3">
                    <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                      Review status
                    </span>
                    <StatusPill
                      tone={
                        selected.reviewStatus === "reviewed"
                          ? "success"
                          : "warning"
                      }
                    >
                      {selected.reviewStatus.replaceAll("_", " ")}
                    </StatusPill>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <WorkState
                    label={
                      data.change.validatedAt
                        ? `Validated ${new Date(data.change.validatedAt).toLocaleDateString()}`
                        : "Awaiting validation"
                    }
                  />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground p-4 text-center text-sm">
                No claim selected.
              </p>
            )}
          </aside>
        </section>
      </Surface>

      {data.claims.some((claim) => claim.reviewStatus === "needs_review") ? (
        <ErrorNotice
          title="Some claims need reviewer attention"
          detail="Resolve low-confidence or conflicting evidence before release authorization."
        />
      ) : null}
    </AuthenticatedProductShell>
  );
}
