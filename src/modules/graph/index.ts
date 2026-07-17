import { GOVERNED_AI_THRESHOLDS } from "@/ai/contracts/tasks";

export type GraphEdge = {
  id: string;
  fromId: string;
  toId: string;
  confidence: number;
  loadBearingScore?: number;
  loadBearingRationale?: string;
  reviewed: boolean;
};

export type GraphPath = {
  edgeIds: string[];
  nodeIds: string[];
  confidence: number;
  rewriteRequired: boolean;
};

export type GraphTraversal = {
  paths: GraphPath[];
  cycles: GraphPath[];
  truncated: boolean;
};

export function classifyReviewState(confidence: number) {
  return confidence >= GOVERNED_AI_THRESHOLDS.autoSuggest
    ? ("suggested" as const)
    : ("needs_review" as const);
}

export function classifyImpact(
  edge: Pick<
    GraphEdge,
    "confidence" | "loadBearingScore" | "loadBearingRationale" | "reviewed"
  >,
) {
  const hasLoadBearingScore = edge.loadBearingScore !== undefined;
  const score = edge.loadBearingScore ?? edge.confidence;
  const rationale =
    edge.loadBearingRationale?.trim() ||
    (hasLoadBearingScore
      ? edge.reviewed
        ? "Reviewed load-bearing score; no model rationale was supplied."
        : "Load-bearing score is pending human review and cannot require a rewrite."
      : "No model load-bearing score; using edge confidence.");

  return {
    class:
      edge.reviewed &&
      hasLoadBearingScore &&
      score >= GOVERNED_AI_THRESHOLDS.rewriteRequired
        ? ("rewrite_required" as const)
        : ("line_edit" as const),
    score,
    rationale,
    fallback: !hasLoadBearingScore
      ? {
          label: "deterministic_fallback" as const,
          reason: rationale,
          reviewRequired: true as const,
        }
      : undefined,
  };
}

export function traverseReviewedGraph(
  startNodeId: string,
  edges: GraphEdge[],
  maxHops = 8,
): GraphTraversal {
  const hopLimit = Number.isFinite(maxHops)
    ? Math.min(8, Math.max(0, Math.floor(maxHops)))
    : 8;
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (!edge.reviewed) continue;
    outgoing.set(edge.fromId, [...(outgoing.get(edge.fromId) ?? []), edge]);
  }

  const paths: GraphPath[] = [];
  const cycles: GraphPath[] = [];
  const stack = [
    {
      nodeIds: [startNodeId],
      edgeIds: [] as string[],
      confidence: 1,
      rewriteRequired: false,
    },
  ];
  let truncated = false;

  while (stack.length) {
    const path = stack.pop();
    if (!path) continue;
    const current = path.nodeIds.at(-1);
    if (!current) continue;
    if (path.edgeIds.length >= hopLimit) {
      truncated ||= Boolean(outgoing.get(current)?.length);
      continue;
    }

    for (const edge of outgoing.get(current) ?? []) {
      const nodeIds = [...path.nodeIds, edge.toId];
      const edgeIds = [...path.edgeIds, edge.id];
      const nextPath: GraphPath = {
        nodeIds,
        edgeIds,
        confidence: Math.min(path.confidence, edge.confidence),
        rewriteRequired:
          path.rewriteRequired ||
          classifyImpact(edge).class === "rewrite_required",
      };

      if (path.nodeIds.includes(edge.toId)) {
        cycles.push(nextPath);
      } else {
        paths.push(nextPath);
        stack.push(nextPath);
      }
    }
  }

  return { paths, cycles, truncated };
}

export {
  acceptDependencyEdge,
  overrideDependencyEdge,
  resolveReviewedEdgeImpact,
  type EdgeOverrideClass,
  type EdgeReviewResult,
} from "@/modules/graph/service";
