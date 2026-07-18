import Link from "next/link";
import { ExternalLink, SlidersHorizontal } from "lucide-react";

import {
  InteractiveGraph,
  type GraphItem,
} from "@/components/product/interactive-graph";
import { Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export async function GraphBriefing() {
  const data = await getProductWorkspace();
  const firstClaim = data.claims[0];
  const sourceId = `source:${data.change.versionId}`;
  const claimIds = new Map(
    data.claims.map((claim) => [claim.versionId, `claim:${claim.versionId}`]),
  );
  const artifactIds = new Map(
    data.impacts
      .filter((impact) => impact.artifactTitle)
      .map((impact) => [impact.objectId, `artifact:${impact.id}`]),
  );

  const items: GraphItem[] = [
    {
      id: sourceId,
      stage: "source",
      title: data.change.sourceTitle,
      meta: `${data.change.newSourceVersionLabel} · ${data.change.newEffectiveDate}`,
      tone: "success",
      quote: data.change.newRule,
      rationale: data.change.newSourceSummary,
    },
    ...data.claims.map((claim) => ({
      id: claimIds.get(claim.versionId)!,
      stage: "claim" as const,
      title: claim.text,
      meta: `${claim.key} · ${claim.versionLabel}`,
      tone:
        claim.reviewStatus === "needs_review"
          ? ("uncertain" as const)
          : ("impacted" as const),
      confidence: Math.round(claim.confidence * 100),
      quote: claim.evidenceQuote,
      rationale: claim.rationale,
      parentId: sourceId,
    })),
    ...data.impacts
      .filter((impact) => impact.artifactTitle)
      .map((impact) => ({
        id: artifactIds.get(impact.objectId)!,
        stage: "artifact" as const,
        title: impact.artifactTitle!,
        meta: `${impact.artifactVersionLabel} · ${impact.artifactKind}`,
        tone:
          impact.rewriteRequired === "yes"
            ? ("rewrite" as const)
            : impact.confidence < 0.6
              ? ("uncertain" as const)
              : ("impacted" as const),
        confidence: Math.round(impact.confidence * 100),
        quote: firstClaim?.evidenceQuote,
        rationale: impact.rationale,
        parentId: firstClaim ? claimIds.get(firstClaim.versionId) : undefined,
      })),
    ...data.exposures.map((exposure) => ({
      id: `role:${exposure.id}`,
      stage: "role" as const,
      title: exposure.roleName,
      meta: `${exposure.peopleCount} potential people`,
      tone:
        exposure.confidence < 0.6
          ? ("uncertain" as const)
          : ("impacted" as const),
      confidence: Math.round(exposure.confidence * 100),
      rationale: exposure.rationale,
      parentId: artifactIds.get(exposure.artifactVersionId),
    })),
  ];

  return (
    <AuthenticatedProductShell
      active="graph"
      eyebrow="Dependency graph"
      title="Graph Briefing"
      description="Explore the current downstream impact of the validated source change. Confidence and uncertainty remain visible on every path."
      action={
        <Button asChild variant="outline">
          <Link href="/app/changes">
            View change record
            <ExternalLink className="size-4" />
          </Link>
        </Button>
      }
    >
      <Surface className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="plum">Impacted {data.impacts.length}</StatusPill>
          <StatusPill tone="danger">
            Rewrite{" "}
            {
              data.impacts.filter((item) => item.rewriteRequired === "yes")
                .length
            }
          </StatusPill>
          <StatusPill tone="warning">
            Uncertain{" "}
            {data.impacts.filter((item) => item.confidence < 0.6).length}
          </StatusPill>
        </div>
        <span className="text-muted-foreground inline-flex items-center gap-2 text-xs">
          <SlidersHorizontal className="size-4" /> Select a node to inspect
          evidence
        </span>
      </Surface>
      <InteractiveGraph items={items} />
    </AuthenticatedProductShell>
  );
}
