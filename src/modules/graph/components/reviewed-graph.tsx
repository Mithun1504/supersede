"use client";

import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useMemo } from "react";

import type {
  ReviewedGraphEdge,
  ReviewedGraphNode,
} from "@/modules/graph/repository";

const columns: Record<ReviewedGraphNode["type"], number> = {
  artifact_version: 0,
  claim_version: 360,
  source_version: 720,
};

export function ReviewedGraph({
  nodes,
  edges,
}: {
  nodes: ReviewedGraphNode[];
  edges: ReviewedGraphEdge[];
}) {
  const flowNodes = useMemo<Node[]>(() => {
    const positions = new Map<string, number>();
    return nodes.map((node) => {
      const row = positions.get(node.type) ?? 0;
      positions.set(node.type, row + 1);
      return {
        id: node.id,
        position: { x: columns[node.type], y: row * 130 },
        data: { label: node.label },
        ariaLabel: `${node.type.replaceAll("_", " ")}: ${node.label}`,
        style: {
          width: 260,
          borderRadius: "var(--radius)",
          borderColor: "var(--border)",
          background: "var(--card)",
          color: "var(--card-foreground)",
          fontSize: 12,
        },
      };
    });
  }, [nodes]);
  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: `${edge.type.replaceAll("_", " ")} · ${Math.round(edge.confidence * 100)}%`,
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)" },
        style: { stroke: "var(--primary)" },
        labelStyle: { fill: "var(--foreground)", fontSize: 10 },
      })),
    [edges],
  );
  return (
    <div
      className="bg-muted/20 h-[36rem] overflow-hidden rounded-xl border"
      aria-label="Reviewed dependency graph"
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        minZoom={0.25}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
