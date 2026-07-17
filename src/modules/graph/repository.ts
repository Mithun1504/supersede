import "server-only";

import { eq, sql } from "drizzle-orm";

import { organizationSettings } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export type GraphEdgeSummary = {
  edgeVersionId: string;
  edgeType: string;
  reviewStatus: string;
  confidence: number;
  loadBearingScore: number;
  rationale: string;
  fromNodeId: string;
  fromType: string;
  fromLabel: string;
  toNodeId: string;
  toType: string;
  toLabel: string;
  quote: string;
};

export type ReviewedGraphNode = {
  id: string;
  type: "source_version" | "artifact_version" | "claim_version";
  label: string;
};

export type ReviewedGraphEdge = {
  id: string;
  from: string;
  to: string;
  type: string;
  confidence: number;
};

export async function getReviewedGraph(actor: CurrentActor): Promise<{
  nodes: ReviewedGraphNode[];
  edges: ReviewedGraphEdge[];
}> {
  const current = (await listGraphEdges(actor)).filter(
    (edge) => edge.reviewStatus === "accepted",
  );
  const nodes = new Map<string, ReviewedGraphNode>();
  for (const edge of current) {
    nodes.set(edge.fromNodeId, {
      id: edge.fromNodeId,
      type: edge.fromType as ReviewedGraphNode["type"],
      label: edge.fromLabel,
    });
    nodes.set(edge.toNodeId, {
      id: edge.toNodeId,
      type: edge.toType as ReviewedGraphNode["type"],
      label: edge.toLabel,
    });
  }
  return {
    nodes: [...nodes.values()],
    edges: current.map((edge) => ({
      id: edge.edgeVersionId,
      from: edge.fromNodeId,
      to: edge.toNodeId,
      type: edge.edgeType,
      confidence: edge.confidence,
    })),
  };
}

export async function listGraphEdges(
  actor: CurrentActor,
  limit = 200,
): Promise<GraphEdgeSummary[]> {
  authorize(actor, "edge.review");
  return withTenantContext(context(actor), async (transaction) => {
    const result = await transaction.execute<{
      edge_version_id: string;
      edge_type: string;
      review_status: string;
      confidence: string;
      load_bearing_score: string;
      rationale: string;
      from_node_id: string;
      from_type: string;
      from_label: string;
      to_node_id: string;
      to_type: string;
      to_label: string;
      quote: string;
    }>(sql`
      select
        ev.id as edge_version_id,
        ev.edge_type,
        ev.review_status,
        ev.confidence,
        ev.load_bearing_score,
        ev.load_bearing_rationale as rationale,
        fn.id as from_node_id,
        fn.node_type as from_type,
        coalesce(fa.title, fs.title, fcv.text, 'Unknown node') as from_label,
        tn.id as to_node_id,
        tn.node_type as to_type,
        coalesce(ta.title, ts.title, tcv.text, 'Unknown node') as to_label,
        es.exact_quote as quote
      from dependency_edge_version ev
      join graph_node fn on fn.id = ev.from_node_id
      join graph_node tn on tn.id = ev.to_node_id
      left join artifact_version fav on fav.id = fn.artifact_version_id
      left join artifact fa on fa.id = fav.artifact_id
      left join source_version fsv on fsv.id = fn.source_version_id
      left join source fs on fs.id = fsv.source_id
      left join claim_version fcv on fcv.id = fn.claim_version_id
      left join artifact_version tav on tav.id = tn.artifact_version_id
      left join artifact ta on ta.id = tav.artifact_id
      left join source_version tsv on tsv.id = tn.source_version_id
      left join source ts on ts.id = tsv.source_id
      left join claim_version tcv on tcv.id = tn.claim_version_id
      join evidence_span es on es.id = ev.evidence_span_id
      where not exists (
        select 1 from dependency_edge_version successor
        where successor.supersedes_edge_version_id = ev.id
      )
      order by
        case ev.review_status when 'accepted' then 0 when 'needs_review' then 1 else 2 end,
        ev.created_at desc,
        ev.id
      limit ${Math.min(200, Math.max(1, limit))}
    `);
    return result.rows.map((row) => ({
      edgeVersionId: row.edge_version_id,
      edgeType: row.edge_type,
      reviewStatus: row.review_status,
      confidence: Number(row.confidence),
      loadBearingScore: Number(row.load_bearing_score),
      rationale: row.rationale,
      fromNodeId: row.from_node_id,
      fromType: row.from_type,
      fromLabel: row.from_label,
      toNodeId: row.to_node_id,
      toType: row.to_type,
      toLabel: row.to_label,
      quote: row.quote,
    }));
  });
}

export type TraversalPath = {
  nodeId: string;
  depth: number;
  nodePath: string[];
  edgePath: string[];
};

export async function traverseAcceptedGraph(
  actor: CurrentActor,
  startNodeIds: string[],
  direction: "upstream_to_downstream" | "downstream_to_upstream",
): Promise<TraversalPath[]> {
  authorize(actor, "change.read");
  if (startNodeIds.length === 0) return [];
  return withTenantContext(context(actor), async (transaction) => {
    const [settings] = await transaction
      .select({ maxDepth: organizationSettings.maxGraphDepth })
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, actor.organization.id))
      .limit(1);
    const maxDepth = Math.min(50, Math.max(1, settings?.maxDepth ?? 12));
    const reverse = direction === "upstream_to_downstream";
    const result = await transaction.execute<{
      node_id: string;
      depth: number;
      node_path: string[];
      edge_path: string[];
    }>(sql`
      with recursive current_edge as (
        select ev.id, ev.from_node_id, ev.to_node_id
        from dependency_edge_version ev
        where ev.review_status = 'accepted'
          and not exists (
            select 1 from dependency_edge_version successor
            where successor.supersedes_edge_version_id = ev.id
          )
      ), walk(node_id, depth, node_path, edge_path) as (
        select seed.node_id, 0, array[seed.node_id]::uuid[], array[]::uuid[]
        from unnest(${startNodeIds}::uuid[]) as seed(node_id)
        union all
        select
          case when ${reverse} then edge.from_node_id else edge.to_node_id end,
          walk.depth + 1,
          walk.node_path || case when ${reverse} then edge.from_node_id else edge.to_node_id end,
          walk.edge_path || edge.id
        from walk
        join current_edge edge on
          case when ${reverse}
            then edge.to_node_id = walk.node_id
            else edge.from_node_id = walk.node_id
          end
        where walk.depth < ${maxDepth}
          and not (
            case when ${reverse} then edge.from_node_id else edge.to_node_id end
            = any(walk.node_path)
          )
      )
      select node_id, depth, node_path, edge_path
      from walk
      order by depth, node_id, edge_path
      limit 5000
    `);
    return result.rows.map((row) => ({
      nodeId: row.node_id,
      depth: Number(row.depth),
      nodePath: row.node_path,
      edgePath: row.edge_path,
    }));
  });
}

function context(actor: CurrentActor) {
  return {
    organizationId: actor.organization.id,
    actorMembershipId: actor.membership.id,
  };
}
