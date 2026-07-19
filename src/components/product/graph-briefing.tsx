import Link from "next/link";

import {
  InteractiveGraph,
  type GraphItem,
} from "@/components/product/interactive-graph";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { EdgeReviewActions } from "@/components/product/governed-actions";
import { SectionTitle, Surface } from "@/components/product/product-shell";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export async function GraphBriefing() {
  const data = await getProductWorkspace();
  const sourceId = `source:${data.change.oldSourceVersionId}`;
  const artifacts = data.impacts.filter(
    (impact) => impact.artifactTitle && impact.artifactVersionLabel,
  );
  const artifactNodeIds = new Map(
    artifacts.map((impact) => [impact.objectId, `artifact:${impact.objectId}`]),
  );
  const claims = data.claims.filter((claim) =>
    artifactNodeIds.has(claim.artifactVersionId),
  );
  const claimNodeIds = new Map(
    claims.map((claim) => [claim.versionId, `claim:${claim.versionId}`]),
  );
  const claimsSupportedByChangedSource = new Set(
    claims
      .filter((claim) => claim.hasReviewedSourceDependency)
      .map((claim) => claim.versionId),
  );
  const fullyTraceableArtifactIds = new Set(
    claims
      .filter((claim) => claimsSupportedByChangedSource.has(claim.versionId))
      .map((claim) => claim.artifactVersionId),
  );
  const claimIdsByArtifact = new Map<string, string[]>();

  for (const claim of claims) {
    const ids = claimIdsByArtifact.get(claim.artifactVersionId) ?? [];
    ids.push(claimNodeIds.get(claim.versionId)!);
    claimIdsByArtifact.set(claim.artifactVersionId, ids);
  }

  const items: GraphItem[] = [
    {
      id: sourceId,
      stage: "source",
      title: data.change.sourceTitle,
      meta: `${data.change.oldSourceVersionLabel} → ${data.change.newSourceVersionLabel} · effective ${data.change.newEffectiveDate}`,
      status: data.change.validatedAt ? "Validated" : "Awaiting validation",
      tone: data.change.validatedAt ? "success" : "uncertain",
      relationship:
        "This governed change compares the superseded source version with its replacement.",
    },
    ...claims.map((claim): GraphItem => ({
      id: claimNodeIds.get(claim.versionId)!,
      stage: "claim",
      title: claim.text,
      meta: `${claim.key} · ${claim.versionLabel} · ${claim.evidenceLocation}`,
      status: formatLabel(claim.reviewStatus),
      tone: claim.reviewStatus === "reviewed" ? "impacted" : "uncertain",
      confidence: Math.round(claim.confidence * 100),
      quote: claim.evidenceQuote,
      rationale: claim.rationale,
      parentIds: claimsSupportedByChangedSource.has(claim.versionId)
        ? [sourceId]
        : [],
      relationship: claimsSupportedByChangedSource.has(claim.versionId)
        ? "A reviewed, locked dependency edge names the superseded source version used by this change."
        : "No reviewed dependency edge names the superseded source version, so no source line is drawn.",
    })),
    ...artifacts.map((impact): GraphItem => {
      const parentIds = claimIdsByArtifact.get(impact.objectId) ?? [];
      const status =
        impact.rewriteRequired === "yes"
          ? "Rewrite required"
          : impact.rewriteRequired === "candidate"
            ? "Review candidate"
            : "No rewrite";

      return {
        id: artifactNodeIds.get(impact.objectId)!,
        stage: "artifact",
        title: impact.artifactTitle!,
        meta: `${impact.artifactVersionLabel} · ${formatLabel(impact.artifactKind ?? "artifact")} · depth ${impact.pathDepth}`,
        status,
        tone:
          impact.confidence < 0.6
            ? "uncertain"
            : impact.rewriteRequired === "yes"
              ? "rewrite"
              : "impacted",
        confidence: Math.round(impact.confidence * 100),
        rationale: impact.rationale,
        parentIds,
        relationship:
          parentIds.length > 0
            ? "The claim names this exact governed artifact version."
            : "No claim-to-artifact relationship is exposed in this read model, so no upstream line is drawn.",
      };
    }),
    ...data.exposures.flatMap((exposure): GraphItem[] => {
      const parentId = artifactNodeIds.get(exposure.artifactVersionId);
      if (!parentId) return [];

      return [
        {
          id: `role:${exposure.id}`,
          stage: "role",
          title: exposure.roleName,
          meta: `${exposure.peopleCount} potentially exposed ${exposure.peopleCount === 1 ? "person" : "people"}`,
          status: "Potential exposure",
          tone: exposure.confidence < 0.6 ? "uncertain" : "impacted",
          confidence: Math.round(exposure.confidence * 100),
          rationale: exposure.rationale,
          parentIds: [parentId],
          relationship:
            "This role-to-artifact exposure is stored directly; the count is potential reach, not an individual outcome.",
        },
      ];
    }),
  ];

  const fullyTraceableArtifacts = artifacts.filter((impact) =>
    fullyTraceableArtifactIds.has(impact.objectId),
  ).length;
  const recordsNeedingReview = items.filter(
    (item) => item.tone === "uncertain",
  ).length;

  return (
    <AuthenticatedProductShell
      active="graph"
      title="Dependency map"
      description="After source validation, inspect the evidence path from the changed source to reviewed claims, owned artifacts, and potentially exposed roles. Missing relationships stay missing rather than being guessed."
      action={
        <Button asChild>
          <Link href="/app/blast-radius">Continue to impact review</Link>
        </Button>
      }
    >
      <section
        aria-label="Dependency path scope"
        className="border-border grid gap-3 border-y py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      >
        <p className="text-sm leading-6">
          <strong>
            {fullyTraceableArtifacts} of {artifacts.length} artifact paths can
            be drawn end to end from exposed records.
          </strong>{" "}
          Detached records remain in the briefing without invented edges.
        </p>
        <p className="text-muted-foreground text-sm font-semibold">
          {recordsNeedingReview} uncertain record
          {recordsNeedingReview === 1 ? "" : "s"}
        </p>
      </section>
      {data.viewer.roles.includes("edge_reviewer") &&
      data.edges.some((edge) => edge.reviewStatus !== "reviewed") ? (
        <Surface className="overflow-hidden">
          <SectionTitle
            title="Dependency edge review"
            detail="Accept only quoted, version-locked relationships. Each decision is written to the approval and audit ledgers."
          />
          <div className="divide-border divide-y">
            {data.edges
              .filter((edge) => edge.reviewStatus !== "reviewed")
              .map((edge) => (
                <div
                  className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  key={edge.versionId}
                >
                  <div>
                    <blockquote className="text-sm leading-6">
                      “{edge.evidenceQuote}”
                    </blockquote>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Confidence {Math.round(edge.confidence * 100)}%
                    </p>
                  </div>
                  <EdgeReviewActions
                    edgeId={edge.id}
                    edgeVersionId={edge.versionId}
                    evidenceQuote={edge.evidenceQuote}
                    loadBearingScore={edge.confidence}
                  />
                </div>
              ))}
          </div>
        </Surface>
      ) : null}
      <InteractiveGraph items={items} />
    </AuthenticatedProductShell>
  );
}

function formatLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
