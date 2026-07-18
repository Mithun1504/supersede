"use client";

import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { Focus, Search, X } from "lucide-react";

import { ConfidenceBar, StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type GraphItem = {
  id: string;
  stage: "source" | "claim" | "artifact" | "role";
  title: string;
  meta: string;
  tone: "success" | "impacted" | "rewrite" | "uncertain";
  confidence?: number | undefined;
  quote?: string | undefined;
  rationale?: string | undefined;
  parentId?: string | undefined;
};

const stageX = { source: 20, claim: 310, artifact: 610, role: 920 } as const;
const toneColor = {
  success: "#2f8f72",
  impacted: "#6558d3",
  rewrite: "#c65a62",
  uncertain: "#b68024",
} as const;

export function InteractiveGraph({ items }: { items: GraphItem[] }) {
  const [selectedId, setSelectedId] = useState(
    () => items.find((item) => item.stage === "artifact")?.id ?? items[0]?.id,
  );
  const [query, setQuery] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  const filteredIds = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return new Set(
      items
        .filter(
          (item) =>
            !normalized ||
            `${item.title} ${item.meta}`.toLowerCase().includes(normalized),
        )
        .map((item) => item.id),
    );
  }, [items, query]);

  const nodes = useMemo<Node[]>(() => {
    const stageIndexes: Record<GraphItem["stage"], number> = {
      source: 0,
      claim: 0,
      artifact: 0,
      role: 0,
    };
    return items.map((item) => {
      const index = stageIndexes[item.stage]++;
      const isSelected = item.id === selectedId;
      const dimmed = query.length > 0 && !filteredIds.has(item.id);
      return {
        id: item.id,
        position: { x: stageX[item.stage], y: 54 + index * 132 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        ariaLabel: `${item.stage}: ${item.title}`,
        data: {
          label: (
            <div className="w-[208px] text-left">
              <p className="text-[9px] font-semibold tracking-[0.14em] uppercase opacity-60">
                {item.stage}
              </p>
              <p className="font-heading mt-1.5 text-xs leading-5 font-semibold">
                {item.title}
              </p>
              <p className="mt-1.5 text-[10px] opacity-65">{item.meta}</p>
            </div>
          ),
        },
        style: {
          color: "var(--foreground)",
          background: "var(--card)",
          border: `${item.tone === "uncertain" ? "1px dashed" : "1px solid"} ${toneColor[item.tone]}`,
          borderRadius: 12,
          padding: "12px 14px",
          boxShadow: isSelected
            ? `0 0 0 3px color-mix(in srgb, ${toneColor[item.tone]} 18%, transparent), 0 8px 22px rgba(15,23,42,.09)`
            : "0 4px 12px rgba(15,23,42,.06)",
          opacity: dimmed ? 0.25 : 1,
          transition:
            "opacity 180ms ease, box-shadow 180ms ease, transform 180ms ease",
        },
      };
    });
  }, [filteredIds, items, query.length, selectedId]);

  const edges = useMemo<Edge[]>(() => {
    const sources = items.filter((item) => item.stage === "source");
    const claims = items.filter((item) => item.stage === "claim");
    const artifacts = items.filter((item) => item.stage === "artifact");
    const roles = items.filter((item) => item.stage === "role");
    const result: Edge[] = [];
    for (const source of sources)
      for (const claim of claims) result.push(makeEdge(source, claim));
    for (const claim of claims)
      for (const artifact of artifacts) result.push(makeEdge(claim, artifact));
    for (const artifact of artifacts) {
      for (const role of roles.filter((item) => item.parentId === artifact.id))
        result.push(makeEdge(artifact, role));
    }
    return result;
  }, [items]);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="app-surface overflow-hidden">
        <div className="border-border/70 bg-muted/35 flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter graph nodes…"
              className="pl-9"
              aria-label="Filter graph nodes"
            />
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Focus className="size-4" /> Scroll to zoom · drag to pan
          </div>
        </div>
        <div className="bg-background h-[62dvh] min-h-[520px] w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.35}
            maxZoom={1.6}
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1}
              color="color-mix(in oklch, var(--muted-foreground) 32%, transparent)"
            />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) =>
                toneColor[
                  items.find((item) => item.id === node.id)?.tone ?? "impacted"
                ]
              }
              maskColor="color-mix(in oklch, var(--background) 72%, transparent)"
            />
          </ReactFlow>
        </div>
      </div>

      <aside className="app-surface h-fit overflow-hidden xl:sticky xl:top-24">
        <div className="border-border/70 bg-muted/35 flex items-start justify-between border-b p-5">
          <div>
            <p className="data-label">Selected path</p>
            <h2 className="mt-2 text-lg font-semibold">
              {selected?.title ?? "No path selected"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear graph selection"
            onClick={() => setSelectedId(undefined)}
          >
            <X />
          </Button>
        </div>
        {selected ? (
          <div className="space-y-5 p-5">
            <StatusPill
              tone={
                selected.tone === "rewrite"
                  ? "danger"
                  : selected.tone === "uncertain"
                    ? "warning"
                    : selected.tone === "success"
                      ? "success"
                      : "plum"
              }
            >
              {selected.tone}
            </StatusPill>
            <p className="text-muted-foreground text-sm leading-6">
              {selected.meta}
            </p>
            {selected.quote ? (
              <figure className="border-border bg-muted/35 rounded-lg border p-4">
                <figcaption className="data-label">Exact quote</figcaption>
                <blockquote className="mt-3 text-sm leading-7 italic">
                  “{selected.quote}”
                </blockquote>
              </figure>
            ) : null}
            {typeof selected.confidence === "number" ? (
              <ConfidenceBar value={selected.confidence} />
            ) : null}
            {selected.rationale ? (
              <div>
                <p className="data-label">Rationale</p>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {selected.rationale}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground p-5 text-sm">
            Select a node to inspect its governed evidence.
          </p>
        )}
      </aside>
    </div>
  );
}

function makeEdge(source: GraphItem, target: GraphItem): Edge {
  const confidence = target.confidence ?? 80;
  return {
    id: `${source.id}-${target.id}`,
    source: source.id,
    target: target.id,
    type: "smoothstep",
    animated: target.tone === "rewrite",
    markerEnd: { type: MarkerType.ArrowClosed, color: toneColor[target.tone] },
    style: {
      stroke: toneColor[target.tone],
      strokeWidth: Math.max(1.3, confidence / 35),
      strokeDasharray: target.tone === "uncertain" ? "6 5" : undefined,
      opacity: 0.72,
    },
  };
}
