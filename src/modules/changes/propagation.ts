import "server-only";

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  auditEvents,
  changeEvents,
  changeEventVersions,
  changeImpacts,
  claims,
  claimVersions,
  dependencyEdgeVersions,
  memberships,
  organizationDomainPolicies,
  people,
  roleArtifactExposures,
  workflowRuns,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import {
  classifyPropagationImpact,
  combinePathConfidence,
  type PropagationImpactKind,
} from "@/modules/changes/propagation-policy";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type WalkRow = {
  depth: number;
  object_type: string;
  object_id: string;
  path_edge_ids: string[];
};

type ImpactCandidate = {
  objectType: string;
  objectId: string;
  impactKind: PropagationImpactKind;
  pathEdgeIds: string[];
  pathDepth: number;
  confidence: number;
  rationale: string;
  rewriteRequired: "yes" | "no" | "candidate";
};

export type PropagationResult = {
  workflowRunId: string;
  changeEventVersionId: string;
  traversalNodeCount: number;
  impactCount: number;
  insertedImpactCount: number;
  reused: boolean;
};

function candidateKey(
  candidate: Pick<ImpactCandidate, "objectType" | "objectId">,
) {
  return `${candidate.objectType}:${candidate.objectId}`;
}

function retainStrongest(
  candidates: Map<string, ImpactCandidate>,
  candidate: ImpactCandidate,
) {
  const key = candidateKey(candidate);
  const existing = candidates.get(key);
  if (
    !existing ||
    candidate.confidence > existing.confidence ||
    (candidate.confidence === existing.confidence &&
      candidate.pathDepth < existing.pathDepth)
  ) {
    candidates.set(key, candidate);
  }
}

async function findCompletedRun(
  transaction: Transaction,
  organizationId: string,
  changeEventVersionId: string,
) {
  const [run] = await transaction
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.organizationId, organizationId),
        eq(workflowRuns.workflowName, "change_propagation_v1"),
        eq(workflowRuns.subjectType, "change_event_version"),
        eq(workflowRuns.subjectId, changeEventVersionId),
        eq(workflowRuns.status, "completed"),
      ),
    )
    .orderBy(desc(workflowRuns.completedAt))
    .limit(1);

  return run;
}

async function loadPathConfidences(
  transaction: Transaction,
  organizationId: string,
  edgeIds: string[],
) {
  if (edgeIds.length === 0) return new Map<string, number>();

  const rows = await transaction
    .select({
      edgeId: dependencyEdgeVersions.edgeId,
      confidence: dependencyEdgeVersions.confidence,
    })
    .from(dependencyEdgeVersions)
    .where(
      and(
        eq(dependencyEdgeVersions.organizationId, organizationId),
        inArray(dependencyEdgeVersions.edgeId, edgeIds),
        eq(dependencyEdgeVersions.reviewStatus, "reviewed"),
      ),
    )
    .orderBy(desc(dependencyEdgeVersions.createdAt));
  const byEdge = new Map<string, number>();
  for (const row of rows) {
    if (!byEdge.has(row.edgeId)) byEdge.set(row.edgeId, Number(row.confidence));
  }
  return byEdge;
}

function confidenceForPath(
  pathEdgeIds: string[],
  confidences: Map<string, number>,
) {
  const values = pathEdgeIds.map((edgeId) => confidences.get(edgeId) ?? 0);
  return combinePathConfidence(values);
}

async function buildImpactCandidates(
  transaction: Transaction,
  organizationId: string,
  walk: WalkRow[],
) {
  const candidates = new Map<string, ImpactCandidate>();
  const edgeIds = [...new Set(walk.flatMap((row) => row.path_edge_ids))];
  const pathConfidences = await loadPathConfidences(
    transaction,
    organizationId,
    edgeIds,
  );
  const claimIds = walk
    .filter((row) => row.object_type === "claim_version")
    .map((row) => row.object_id);
  const claimRows =
    claimIds.length === 0
      ? []
      : await transaction
          .select({
            id: claimVersions.id,
            artifactVersionId: claims.artifactVersionId,
            confidence: claimVersions.confidence,
            loadBearingScore: claimVersions.loadBearingScore,
            rationale: claimVersions.loadBearingRationale,
          })
          .from(claimVersions)
          .innerJoin(claims, eq(claims.id, claimVersions.claimId))
          .where(
            and(
              eq(claimVersions.organizationId, organizationId),
              eq(claims.organizationId, organizationId),
              eq(claimVersions.reviewStatus, "reviewed"),
              isNotNull(claimVersions.lockedAt),
              inArray(claimVersions.id, claimIds),
            ),
          );
  const claimById = new Map(claimRows.map((claim) => [claim.id, claim]));

  for (const row of walk) {
    if (row.depth === 0) continue;
    const pathConfidence = confidenceForPath(
      row.path_edge_ids,
      pathConfidences,
    );
    const claim = claimById.get(row.object_id);
    if (row.object_type === "claim_version" && !claim) continue;
    const loadBearingScore = claim ? Number(claim.loadBearingScore) : undefined;
    const classification = classifyPropagationImpact(
      row.object_type,
      loadBearingScore,
    );
    const confidence = claim
      ? Math.min(pathConfidence, Number(claim.confidence))
      : pathConfidence;
    const base: Omit<ImpactCandidate, "objectType" | "objectId"> = {
      ...classification,
      pathEdgeIds: row.path_edge_ids,
      pathDepth: row.depth,
      confidence,
      rationale:
        claim?.rationale ?? "Reviewed dependency path from the changed source.",
    };

    retainStrongest(candidates, {
      ...base,
      objectType: row.object_type,
      objectId: row.object_id,
    });
    if (claim) {
      retainStrongest(candidates, {
        ...base,
        objectType: "artifact_version",
        objectId: claim.artifactVersionId,
      });
    }
  }

  const artifactCandidates = [...candidates.values()].filter(
    (candidate) => candidate.objectType === "artifact_version",
  );
  const artifactVersionIds = artifactCandidates.map(
    (candidate) => candidate.objectId,
  );
  const exposures =
    artifactVersionIds.length === 0
      ? []
      : await transaction
          .select({
            artifactVersionId: roleArtifactExposures.artifactVersionId,
            professionalRoleId: roleArtifactExposures.professionalRoleId,
            confidence: roleArtifactExposures.confidence,
            rationale: roleArtifactExposures.rationale,
          })
          .from(roleArtifactExposures)
          .where(
            and(
              eq(roleArtifactExposures.organizationId, organizationId),
              inArray(
                roleArtifactExposures.artifactVersionId,
                artifactVersionIds,
              ),
            ),
          );
  const peopleRows =
    exposures.length === 0
      ? []
      : await transaction
          .select({
            id: people.id,
            professionalRoleId: people.professionalRoleId,
          })
          .from(people)
          .where(
            and(
              eq(people.organizationId, organizationId),
              inArray(
                people.professionalRoleId,
                exposures.map((exposure) => exposure.professionalRoleId),
              ),
            ),
          );

  for (const exposure of exposures) {
    const parent = candidates.get(
      candidateKey({
        objectType: "artifact_version",
        objectId: exposure.artifactVersionId,
      }),
    );
    if (!parent) continue;
    const confidence = Math.min(parent.confidence, Number(exposure.confidence));
    const exposureBase = {
      impactKind: "person_exposure" as const,
      pathEdgeIds: parent.pathEdgeIds,
      pathDepth: parent.pathDepth,
      confidence,
      rationale: exposure.rationale,
      rewriteRequired: "no" as const,
    };
    retainStrongest(candidates, {
      ...exposureBase,
      objectType: "professional_role",
      objectId: exposure.professionalRoleId,
    });
    for (const person of peopleRows) {
      if (person.professionalRoleId !== exposure.professionalRoleId) continue;
      retainStrongest(candidates, {
        ...exposureBase,
        objectType: "person",
        objectId: person.id,
      });
    }
  }

  return [...candidates.values()];
}

export async function runPropagationForOrganization(
  context: { organizationId: string; actorMembershipId: string },
  changeEventVersionId: string,
): Promise<PropagationResult> {
  return withTenantContext(context, async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`propagation:${changeEventVersionId}`}, 0))`,
    );
    const existing = await findCompletedRun(
      transaction,
      context.organizationId,
      changeEventVersionId,
    );
    if (existing) {
      const impacts = await transaction
        .select({ id: changeImpacts.id })
        .from(changeImpacts)
        .where(
          and(
            eq(changeImpacts.organizationId, context.organizationId),
            eq(changeImpacts.changeEventVersionId, changeEventVersionId),
          ),
        );
      return {
        workflowRunId: existing.id,
        changeEventVersionId,
        traversalNodeCount: 0,
        impactCount: impacts.length,
        insertedImpactCount: 0,
        reused: true,
      };
    }

    const [change] = await transaction
      .select({
        id: changeEvents.id,
        oldSourceVersionId: changeEventVersions.oldSourceVersionId,
        validatedAt: changeEvents.validatedAt,
        lockedAt: changeEventVersions.lockedAt,
      })
      .from(changeEventVersions)
      .innerJoin(
        changeEvents,
        eq(changeEvents.id, changeEventVersions.changeEventId),
      )
      .where(
        and(
          eq(changeEventVersions.organizationId, context.organizationId),
          eq(changeEventVersions.id, changeEventVersionId),
        ),
      )
      .limit(1);
    if (!change) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "ChangeEvent version not found.",
        status: 404,
      });
    }
    if (!change.validatedAt || !change.lockedAt) {
      throw new AppError({
        code: "CONFLICT",
        message:
          "Propagation requires a validated, locked ChangeEvent version.",
        status: 409,
      });
    }

    const [actor] = await transaction
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, context.organizationId),
          eq(memberships.id, context.actorMembershipId),
          eq(memberships.status, "active"),
        ),
      )
      .limit(1);
    if (!actor) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Propagation actor is not an active tenant member.",
        status: 403,
      });
    }

    const [policy] = await transaction
      .select({ maxDepth: organizationDomainPolicies.graphMaxDepth })
      .from(organizationDomainPolicies)
      .where(
        eq(organizationDomainPolicies.organizationId, context.organizationId),
      )
      .limit(1);
    const maxDepth = Math.min(policy?.maxDepth ?? 8, 8);
    const startedAt = new Date();
    const [workflow] = await transaction
      .insert(workflowRuns)
      .values({
        organizationId: context.organizationId,
        workflowName: "change_propagation_v1",
        subjectType: "change_event_version",
        subjectId: changeEventVersionId,
        status: "running",
        startedAt,
        updatedAt: startedAt,
      })
      .returning({ id: workflowRuns.id });
    if (!workflow)
      throw new Error("Propagation workflow could not be created.");

    const walked = await transaction.execute<WalkRow>(
      sql`select * from app.traverse_dependency_graph(
        ${"source_version"},
        ${change.oldSourceVersionId},
        ${maxDepth}
      )`,
    );
    const candidates = await buildImpactCandidates(
      transaction,
      context.organizationId,
      walked.rows,
    );
    const inserted =
      candidates.length === 0
        ? []
        : await transaction
            .insert(changeImpacts)
            .values(
              candidates.map((candidate) => ({
                organizationId: context.organizationId,
                changeEventVersionId,
                impactedObjectType: candidate.objectType,
                impactedObjectId: candidate.objectId,
                impactKind: candidate.impactKind,
                pathEdgeIds: candidate.pathEdgeIds,
                pathDepth: candidate.pathDepth,
                confidence: candidate.confidence.toFixed(3),
                rationale: candidate.rationale,
                rewriteRequired: candidate.rewriteRequired,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: changeImpacts.id });
    const materializedImpacts = await transaction
      .select({ id: changeImpacts.id })
      .from(changeImpacts)
      .where(
        and(
          eq(changeImpacts.organizationId, context.organizationId),
          eq(changeImpacts.changeEventVersionId, changeEventVersionId),
        ),
      );
    const completedAt = new Date();
    await transaction
      .update(workflowRuns)
      .set({
        status: "completed",
        progressCurrent: candidates.length,
        progressTotal: candidates.length,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(workflowRuns.id, workflow.id));
    await transaction.insert(auditEvents).values({
      organizationId: context.organizationId,
      actorMembershipId: context.actorMembershipId,
      eventType: "propagation.completed",
      objectType: "change_event",
      objectId: change.id,
      objectVersionId: changeEventVersionId,
      payload: {
        workflowRunId: workflow.id,
        traversalNodeCount: walked.rows.length,
        impactCount: materializedImpacts.length,
        insertedImpactCount: inserted.length,
        maxDepth,
      },
      occurredAt: completedAt,
    });

    return {
      workflowRunId: workflow.id,
      changeEventVersionId,
      traversalNodeCount: walked.rows.length,
      impactCount: materializedImpacts.length,
      insertedImpactCount: inserted.length,
      reused: false,
    };
  });
}
