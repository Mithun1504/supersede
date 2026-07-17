import "server-only";

import { eq, sql } from "drizzle-orm";

import {
  artifactOwners,
  artifactRemediations,
  artifactVersions,
  changeImpactPaths,
  changeImpactPathSteps,
  changeImpacts,
  changeEventVersions,
  organizationSettings,
  propagationRuns,
  workflowRuns,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import type { CurrentActor } from "@/modules/identity/policy";

type WalkRow = {
  node_id: string;
  path_nodes: string[];
  path_edges: string[];
  path_confidence: string;
  load_bearing_score: string;
  rationale: string;
  depth: number;
  claim_version_id: string | null;
  artifact_version_id: string | null;
};

export async function runPropagation(
  actor: CurrentActor,
  changeEventVersionId: string,
): Promise<string> {
  return runPropagationForOrganization(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    changeEventVersionId,
  );
}

export async function runPropagationForOrganization(
  context: { organizationId: string; actorMembershipId: string },
  changeEventVersionId: string,
): Promise<string> {
  return withTenantContext(context, async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`propagation:${changeEventVersionId}`}, 0))`,
    );
    const [existing] = await transaction
      .select({ id: propagationRuns.id })
      .from(propagationRuns)
      .where(eq(propagationRuns.changeEventVersionId, changeEventVersionId))
      .limit(1);
    if (existing) return existing.id;
    const [change] = await transaction
      .select({
        oldSourceVersionId: changeEventVersions.oldSourceVersionId,
        status: changeEventVersions.status,
        changeEventId: changeEventVersions.changeEventId,
      })
      .from(changeEventVersions)
      .where(eq(changeEventVersions.id, changeEventVersionId))
      .limit(1);
    if (!change || change.status !== "validated")
      throw new AppError({
        code: "CONFLICT",
        message: "Propagation requires a validated ChangeEvent version.",
        status: 409,
      });
    const [settings] = await transaction
      .select({ maxDepth: organizationSettings.maxGraphDepth })
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, context.organizationId))
      .limit(1);
    const maxDepth = settings?.maxDepth ?? 8;
    const cutoff = new Date();
    const [workflow] = await transaction
      .insert(workflowRuns)
      .values({
        organizationId: context.organizationId,
        workflowName: "change_propagation_v1",
        subjectType: "change_event_version",
        subjectId: changeEventVersionId,
        status: "running",
        progressCurrent: 0,
        idempotencyKey: `change-propagation-v1:${changeEventVersionId}`,
        startedAt: cutoff,
        lastHeartbeatAt: cutoff,
      })
      .returning({ id: workflowRuns.id });
    if (!workflow)
      throw new AppError({
        code: "INTERNAL_ERROR",
        message: "Propagation workflow could not be created.",
        status: 500,
      });
    const [run] = await transaction
      .insert(propagationRuns)
      .values({
        organizationId: context.organizationId,
        changeEventVersionId,
        workflowRunId: workflow.id,
        graphCutoffAt: cutoff,
        algorithmVersion: "accepted_reverse_walk_v1",
        maxDepth,
        status: "running",
        startedAt: cutoff,
      })
      .returning({ id: propagationRuns.id });
    if (!run)
      throw new AppError({
        code: "INTERNAL_ERROR",
        message: "Propagation run could not be created.",
        status: 500,
      });

    const walked = await transaction.execute<WalkRow>(sql`
        with recursive walk as (
          select node.id as node_id, array[node.id]::uuid[] as path_nodes,
            array[]::uuid[] as path_edges, 1.0::numeric as path_confidence,
            0.0::numeric as load_bearing_score, ''::text as rationale, 0 as depth
          from graph_node node
          where node.source_version_id = ${change.oldSourceVersionId}
          union all
          select edge.from_node_id, walk.path_nodes || edge.from_node_id,
            walk.path_edges || edge.id,
            walk.path_confidence * edge.confidence,
            edge.load_bearing_score, edge.load_bearing_rationale, walk.depth + 1
          from walk
          join dependency_edge_version edge on edge.to_node_id = walk.node_id
          where edge.review_status = 'accepted'
            and edge.created_at <= ${cutoff}
            and not exists (
              select 1 from dependency_edge_version successor
              where successor.supersedes_edge_version_id = edge.id
                and successor.created_at <= ${cutoff}
            )
            and walk.depth < ${maxDepth}
            and not edge.from_node_id = any(walk.path_nodes)
        )
        select walk.*, node.claim_version_id, node.artifact_version_id
        from walk join graph_node node on node.id = walk.node_id
        where walk.depth > 0
        order by walk.path_confidence desc, walk.depth asc
      `);
    const rows = walked.rows;
    const bestByNode = new Map<string, WalkRow>();
    for (const row of rows)
      if (
        !bestByNode.has(row.node_id) &&
        (row.claim_version_id || row.artifact_version_id)
      )
        bestByNode.set(row.node_id, row);
    let impactsFound = 0;
    for (const row of bestByNode.values()) {
      const score = Number(row.load_bearing_score);
      const confidence = Math.max(0, Math.min(1, Number(row.path_confidence)));
      const [impact] = await transaction
        .insert(changeImpacts)
        .values({
          organizationId: context.organizationId,
          propagationRunId: run.id,
          changeEventVersionId,
          impactClass: score >= 0.5 ? "load_bearing" : "peripheral",
          confidence: confidence.toFixed(4),
          rationale:
            row.rationale ||
            "Accepted dependency path from the changed source.",
          claimVersionId: row.claim_version_id,
          artifactVersionId: row.artifact_version_id,
          requiresRemediation: Boolean(row.artifact_version_id),
          reviewStatus: "accepted",
        })
        .returning({ id: changeImpacts.id });
      if (!impact) continue;
      impactsFound += 1;
      const [path] = await transaction
        .insert(changeImpactPaths)
        .values({
          organizationId: context.organizationId,
          changeImpactId: impact.id,
          pathRank: 0,
          pathConfidence: confidence.toFixed(4),
        })
        .returning({ id: changeImpactPaths.id });
      if (path)
        await transaction.insert(changeImpactPathSteps).values(
          row.path_nodes.map((nodeId, position) => ({
            organizationId: context.organizationId,
            changeImpactPathId: path.id,
            position,
            graphNodeId: nodeId,
            dependencyEdgeVersionId:
              position === 0 ? null : row.path_edges[position - 1],
          })),
        );
      if (row.artifact_version_id) {
        const [artifact] = await transaction
          .select({ artifactId: artifactVersions.artifactId })
          .from(artifactVersions)
          .where(eq(artifactVersions.id, row.artifact_version_id))
          .limit(1);
        if (artifact) {
          const [owner] = await transaction
            .select({ membershipId: artifactOwners.membershipId })
            .from(artifactOwners)
            .where(eq(artifactOwners.artifactId, artifact.artifactId))
            .limit(1);
          await transaction.insert(artifactRemediations).values({
            organizationId: context.organizationId,
            changeImpactId: impact.id,
            artifactId: artifact.artifactId,
            impactedArtifactVersionId: row.artifact_version_id,
            assignedToMembershipId: owner?.membershipId,
            requiredAction: score >= 0.5 ? "rewrite" : "review_only",
            status: owner ? "assigned" : "open",
          });
        }
      }
    }
    const completed = new Date();
    await transaction
      .update(propagationRuns)
      .set({
        status: "completed",
        nodesExamined: rows.length + 1,
        edgesExamined: rows.length,
        impactsFound,
        completedAt: completed,
      })
      .where(eq(propagationRuns.id, run.id));
    await transaction
      .update(workflowRuns)
      .set({
        status: "completed",
        progressCurrent: impactsFound,
        progressTotal: impactsFound,
        completedAt: completed,
        lastHeartbeatAt: completed,
      })
      .where(eq(workflowRuns.id, workflow.id));
    await recordMembershipEvent(transaction, {
      organizationId: context.organizationId,
      actorMembershipId: context.actorMembershipId,
      eventType: "propagation.completed",
      objectType: "change_event",
      objectId: change.changeEventId,
      objectVersionId: changeEventVersionId,
      payload: {
        propagationRunId: run.id,
        nodesExamined: rows.length + 1,
        impactsFound,
      },
    });
    return run.id;
  });
}
