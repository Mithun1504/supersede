import Link from "next/link";
import type { Metadata } from "next";
import type React from "react";

import { SectionTitle, Surface } from "@/components/product/product-shell";
import {
  ArtifactCorrectionActions,
  ArtifactOwnerAssignment,
  ArtifactReviewActions,
  MutationButton,
} from "@/components/product/governed-actions";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export const metadata: Metadata = { title: "Impact review" };

type Workspace = Awaited<ReturnType<typeof getProductWorkspace>>;
type Impact = Workspace["impacts"][number];
type RewriteState = Impact["rewriteRequired"];

const rewriteRank: Record<RewriteState, number> = {
  yes: 0,
  candidate: 1,
  no: 2,
};

const rewriteCopy: Record<
  RewriteState,
  { label: string; className: string; instruction: string }
> = {
  yes: {
    label: "Rewrite",
    className: "text-destructive",
    instruction: "Assign rewrite owner",
  },
  candidate: {
    label: "Review",
    className: "text-warning",
    instruction: "Review before changing",
  },
  no: {
    label: "No rewrite",
    className: "text-muted-foreground",
    instruction: "No change action",
  },
};

export default async function BlastRadiusPage() {
  const data = await getProductWorkspace();
  const artifactImpacts = [...data.impacts]
    .filter((impact) => impact.artifactId)
    .sort((a, b) => {
      const rankDelta =
        rewriteRank[a.rewriteRequired] - rewriteRank[b.rewriteRequired];

      if (rankDelta !== 0) {
        return rankDelta;
      }

      return b.confidence - a.confidence || a.pathDepth - b.pathDepth;
    });

  const totalPotentialExposures = data.exposures.reduce(
    (sum, exposure) => sum + exposure.peopleCount,
    0,
  );
  const rewriteCount = artifactImpacts.filter(
    (impact) => impact.rewriteRequired === "yes",
  ).length;
  const reviewCount = artifactImpacts.filter(
    (impact) => impact.rewriteRequired === "candidate",
  ).length;
  const canTriage = data.viewer.roles.includes("edge_reviewer");

  return (
    <AuthenticatedProductShell
      active="blast-radius"
      title="Impact review"
      description="Current owner triage for artifacts touched by the active change path. Exposure counts show potential reach, not an individual outcome."
      action={
        <Button asChild>
          <Link href="/app/cases">Continue to decision cases</Link>
        </Button>
      }
    >
      <Surface className="overflow-hidden">
        <SectionTitle
          title="Owner triage ledger"
          detail={`${artifactImpacts.length} artifacts ordered by rewrite state, confidence, and path depth. ${rewriteCount} rewrite, ${reviewCount} review, ${totalPotentialExposures} potential person-artifact exposures.`}
        />

        {artifactImpacts.length > 0 ? (
          <div>
            <div className="border-border bg-muted/20 text-muted-foreground hidden grid-cols-[40px_minmax(160px,1.25fr)_minmax(112px,0.75fr)_minmax(88px,0.55fr)_minmax(150px,1fr)_minmax(170px,1.15fr)] gap-3 border-b px-5 py-3 text-xs font-semibold xl:grid">
              <span>Order</span>
              <span>Artifact</span>
              <span>State / owner</span>
              <span>Path</span>
              <span>Role exposure</span>
              <span>Rationale / confidence</span>
            </div>

            <ol className="divide-border divide-y">
              {artifactImpacts.map((impact, index) => {
                const exposures = data.exposures.filter(
                  (exposure) => exposure.artifactVersionId === impact.objectId,
                );
                const potentiallyExposedPeople = exposures.reduce(
                  (sum, exposure) => sum + exposure.peopleCount,
                  0,
                );
                const rewrite = rewriteCopy[impact.rewriteRequired];

                return (
                  <li
                    className="grid gap-4 px-4 py-4 sm:gap-5 sm:py-5 xl:grid-cols-[40px_minmax(160px,1.25fr)_minmax(112px,0.75fr)_minmax(88px,0.55fr)_minmax(150px,1fr)_minmax(170px,1.15fr)] xl:items-start xl:gap-3 xl:px-5"
                    key={impact.id}
                  >
                    <div className="flex items-baseline justify-between gap-3 xl:block">
                      <span className="text-muted-foreground text-xs font-semibold xl:hidden">
                        Order
                      </span>
                      <span className="font-heading text-primary text-base font-semibold tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <LedgerCell label="Artifact">
                      <p className="text-sm leading-6 font-semibold">
                        {impact.artifactTitle}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {impact.artifactVersionLabel} ·{" "}
                        {formatArtifactKind(impact.artifactKind)}
                      </p>
                    </LedgerCell>

                    <LedgerCell label="State / owner">
                      <p
                        className={`text-sm font-semibold ${rewrite.className}`}
                      >
                        {rewrite.label}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {impact.artifactOwner ?? "Unassigned"} ·{" "}
                        {impact.artifactOwner
                          ? "Owner recorded"
                          : rewrite.instruction}
                      </p>
                    </LedgerCell>

                    <LedgerCell label="Path">
                      <p className="text-sm font-semibold">
                        Depth {impact.pathDepth}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {formatImpactKind(impact.kind)}
                      </p>
                    </LedgerCell>

                    <LedgerCell label="Role exposure">
                      {exposures.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">
                            {potentiallyExposedPeople} potentially exposed{" "}
                            {potentiallyExposedPeople === 1
                              ? "person"
                              : "people"}
                          </p>
                          <ul className="space-y-1">
                            {exposures.map((exposure) => (
                              <li
                                className="text-muted-foreground text-xs leading-5"
                                key={exposure.id}
                              >
                                {exposure.roleName}: {exposure.peopleCount}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          No linked role exposure
                        </p>
                      )}
                    </LedgerCell>

                    <LedgerCell label="Rationale / confidence">
                      <p className="text-sm leading-6">{impact.rationale}</p>
                      <p className="text-muted-foreground mt-2 text-xs font-semibold">
                        Evidence confidence {formatPercent(impact.confidence)}
                      </p>
                      {canTriage && impact.artifactId ? (
                        <div className="mt-3">
                          <MutationButton
                            endpoint={`/api/v1/workflow/artifacts/${impact.artifactId}/triage`}
                            label={
                              impact.rewriteRequired === "yes"
                                ? "Confirm correction"
                                : "Confirm triage"
                            }
                            body={{
                              artifactVersionId: impact.objectId,
                              changeEventVersionId: data.change.versionId,
                              decision:
                                impact.rewriteRequired === "yes"
                                  ? "requires_correction"
                                  : "no_change_required",
                              rationale: impact.rationale,
                            }}
                            variant="outline"
                          />
                        </div>
                      ) : null}
                      {canTriage && impact.artifactId ? (
                        <ArtifactOwnerAssignment
                          artifactId={impact.artifactId}
                          members={data.members}
                        />
                      ) : null}
                      {impact.artifactId &&
                      impact.rewriteRequired === "yes" &&
                      impact.artifactOwnerMembershipId ===
                        data.viewer.membershipId ? (
                        <ArtifactCorrectionActions
                          artifactId={impact.artifactId}
                          parentArtifactVersionId={impact.objectId}
                        />
                      ) : null}
                      {canTriage &&
                      impact.artifactId &&
                      impact.correctionVersionId ? (
                        <ArtifactReviewActions
                          artifactId={impact.artifactId}
                          artifactVersionId={impact.correctionVersionId}
                          locked={Boolean(impact.correctionLockedAt)}
                          published={impact.correctionPublished}
                        />
                      ) : null}
                    </LedgerCell>
                  </li>
                );
              })}
            </ol>

            <p className="border-border bg-muted/15 text-muted-foreground border-t px-4 py-3 text-xs leading-5 xl:px-6">
              Count caveat: the workspace total sums people across artifact-role
              links. The same person can appear once for every linked artifact,
              so this is not a distinct-person count.
            </p>
          </div>
        ) : (
          <div className="px-4 py-10 sm:px-6">
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold">No artifact impacts yet</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                The active change has no artifact-version impact rows. Review
                the validated source change and dependency map before opening
                decision cases.
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/app/graph">Return to dependency map</Link>
              </Button>
            </div>
          </div>
        )}
      </Surface>
    </AuthenticatedProductShell>
  );
}

function LedgerCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-3 xl:block">
      <span className="text-muted-foreground text-xs font-semibold xl:hidden">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatArtifactKind(kind: string | null) {
  return kind ? kind.replaceAll("_", " ") : "artifact";
}

function formatImpactKind(kind: string) {
  return kind.replaceAll("_", " ");
}
