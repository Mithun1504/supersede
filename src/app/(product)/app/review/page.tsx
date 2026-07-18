import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { LiveExtractionPanel } from "@/components/product/live-extraction-panel";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { Surface } from "@/components/product/product-shell";
import { ConfidenceBar, StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getConfigurationStatus } from "@/lib/env/server";
import { getProductWorkspace } from "@/modules/product";

export const metadata: Metadata = {
  title: "Evidence Intake",
};

const statusTone = {
  suggested: "plum",
  needs_review: "warning",
  reviewed: "success",
  rejected: "danger",
  retired: "neutral",
} as const;

const statusLabel = {
  suggested: "Queued",
  needs_review: "Needs attention",
  reviewed: "Reviewed",
  rejected: "Rejected",
  retired: "Retired",
} as const;

export default async function ReviewPage() {
  const data = await getProductWorkspace();
  const configuration = getConfigurationStatus();
  const unresolvedCount = data.claims.filter(
    (claim) =>
      claim.reviewStatus === "suggested" ||
      claim.reviewStatus === "needs_review",
  ).length;
  const reviewedCount = data.claims.filter(
    (claim) => claim.reviewStatus === "reviewed",
  ).length;

  return (
    <AuthenticatedProductShell
      active="review"
      title="Evidence intake"
      description="Bring a source into the governed record, check each claim against its exact passage, then carry its visible review state into the dependency map."
      action={
        <Button asChild>
          <Link href="/app/changes">
            Continue to source change
            <ArrowRight aria-hidden="true" />
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
        <header className="border-border grid gap-5 border-b px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] lg:items-end">
          <div>
            <p className="data-label">Governed review queue</p>
            <h2 className="mt-2 text-xl font-semibold">Claims on record</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              Every row keeps the source version, quote location, review state,
              and routing signal together. Confidence orders attention; it is
              not a finding of correctness.
            </p>
          </div>
          <dl className="border-border grid grid-cols-2 border-t pt-4 lg:border-t-0 lg:pt-0">
            <div>
              <dt className="data-label">Awaiting review</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {unresolvedCount}
              </dd>
            </div>
            <div className="border-border border-l pl-5">
              <dt className="data-label">Reviewed</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {reviewedCount}
              </dd>
            </div>
          </dl>
        </header>

        {data.claims.length ? (
          <ol className="divide-border divide-y">
            {data.claims.map((claim, index) => (
              <li
                className="grid gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[52px_minmax(0,1fr)_260px] lg:gap-6"
                key={claim.versionId}
              >
                <p className="text-muted-foreground font-mono text-xs tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <article className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={statusTone[claim.reviewStatus]}>
                      {statusLabel[claim.reviewStatus]}
                    </StatusPill>
                    <span className="text-muted-foreground font-mono text-xs">
                      {claim.key} · {claim.versionLabel}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base leading-6 font-semibold text-pretty">
                    {claim.text}
                  </h3>
                  <figure className="border-border bg-muted/20 mt-4 border p-4">
                    <figcaption className="data-label">
                      Evidence passage
                    </figcaption>
                    <blockquote className="mt-2 text-sm leading-6">
                      “{claim.evidenceQuote}”
                    </blockquote>
                  </figure>
                  <dl className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <div className="flex gap-1.5">
                      <dt>Source</dt>
                      <dd className="text-foreground font-medium">
                        {claim.artifactTitle}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>Version</dt>
                      <dd className="text-foreground font-mono">
                        {claim.artifactVersionLabel}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>Location</dt>
                      <dd className="text-foreground font-mono">
                        {claim.evidenceLocation}
                      </dd>
                    </div>
                  </dl>
                </article>
                <aside className="border-border border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
                  <p className="data-label">Review priority signal</p>
                  <div className="mt-3">
                    <ConfidenceBar value={Math.round(claim.confidence * 100)} />
                  </div>
                  <p className="text-muted-foreground mt-4 text-xs leading-5">
                    Used to order human review only. Dependency criticality is
                    assessed after change validation in step 03.
                  </p>
                  <p className="text-muted-foreground mt-4 text-xs">
                    {claim.reviewedBy
                      ? `Reviewed by ${claim.reviewedBy}`
                      : "Human review not yet recorded"}
                  </p>
                </aside>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground px-6 py-10 text-sm">
            No claims are on record. Add a source above to begin intake.
          </p>
        )}
      </Surface>

      <Surface className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="data-label">Next in the workflow · 02</p>
          <h2 className="mt-2 text-lg font-semibold">
            Validate the source change
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            A second reviewer must validate and lock the retired and replacement
            rules before propagation can produce a dependable dependency map.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/changes">
            Open source change
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </Surface>
    </AuthenticatedProductShell>
  );
}
