"use client";

import { useState } from "react";
import {
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";

import { ConfidenceBar } from "@/components/product/status";
import { MobileGraphPaths } from "@/components/product/mobile-graph-paths";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type GraphItem = {
  id: string;
  stage: "source" | "claim" | "artifact" | "role";
  title: string;
  meta: string;
  status: string;
  tone: "success" | "impacted" | "rewrite" | "uncertain";
  confidence?: number | undefined;
  quote?: string | undefined;
  rationale?: string | undefined;
  parentIds?: string[] | undefined;
  relationship?: string | undefined;
};

const stages = ["source", "claim", "artifact", "role"] as const;
const stageLabel: Record<GraphItem["stage"], string> = {
  source: "Source",
  claim: "Claim",
  artifact: "Artifact",
  role: "Role exposure",
};
const stageNumber: Record<GraphItem["stage"], string> = {
  source: "A",
  claim: "B",
  artifact: "C",
  role: "D",
};
const stageX = { source: 20, claim: 280, artifact: 540, role: 800 } as const;
const toneColor = {
  success: "var(--success)",
  impacted: "var(--primary)",
  rewrite: "var(--destructive)",
  uncertain: "var(--warning)",
} as const;

export function InteractiveGraph({ items }: { items: GraphItem[] }) {
  const reachableIds = getReachableIds(items);
  const canvasItems = items.filter((item) => reachableIds.has(item.id));
  const unlinkedItems = items.filter((item) => !reachableIds.has(item.id));
  const [selectedId, setSelectedId] = useState(
    () =>
      canvasItems.find((item) => item.stage === "artifact")?.id ??
      canvasItems[0]?.id,
  );
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredIds = new Set(
    items
      .filter((item) => matchesQuery(item, normalizedQuery))
      .map((item) => item.id),
  );
  const focusIds = getGraphContextIds(
    canvasItems,
    normalizedQuery ? filteredIds : new Set(selectedId ? [selectedId] : []),
  );
  const desktopItems = showAll
    ? canvasItems
    : canvasItems.filter((item) => focusIds.has(item.id));
  const nodes = buildNodes(
    desktopItems,
    selectedId,
    normalizedQuery,
    filteredIds,
  );
  const edges = buildEdges(desktopItems);

  return (
    <div className="min-w-0">
      <div className="xl:hidden">
        <div className="app-surface overflow-hidden">
          <GraphToolbar query={query} onQueryChange={setQuery} />
          <MobileGraphPaths
            items={canvasItems}
            query={normalizedQuery}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
          <PathInspector item={selected} />
        </div>
        <UnlinkedRecords items={unlinkedItems} query={normalizedQuery} />
      </div>

      <div className="hidden min-w-0 xl:block">
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="app-surface overflow-hidden">
            <GraphToolbar
              query={query}
              onQueryChange={setQuery}
              connectedCount={canvasItems.length}
              showAll={showAll}
              onShowAllChange={setShowAll}
            />
            <div className="bg-card h-[64dvh] min-h-[560px] w-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                fitView
                fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
                minZoom={0.4}
                maxZoom={1.45}
                nodesDraggable={false}
                nodesConnectable={false}
                proOptions={{ hideAttribution: true }}
              />
            </div>
          </section>
          <PathInspector item={selected} standalone />
        </div>
        <UnlinkedRecords items={unlinkedItems} query={normalizedQuery} />
      </div>
    </div>
  );
}

function GraphToolbar({
  query,
  onQueryChange,
  connectedCount,
  showAll,
  onShowAllChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  connectedCount?: number;
  showAll?: boolean;
  onShowAllChange?: (value: boolean) => void;
}) {
  return (
    <div className="border-border bg-muted/35 flex flex-wrap items-center justify-between gap-3 border-b p-3">
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Find a claim, artifact, or role"
        className="min-w-56 flex-1 sm:max-w-sm"
        aria-label="Find a record in the dependency path"
      />
      {onShowAllChange ? (
        <div className="border-border flex shrink-0 border text-xs font-bold">
          <button
            type="button"
            aria-pressed={!showAll}
            className={cn(
              "focus-visible:ring-ring px-3 py-2 focus-visible:ring-2 focus-visible:outline-none",
              !showAll
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => onShowAllChange(false)}
          >
            Selected path
          </button>
          <button
            type="button"
            aria-pressed={showAll}
            className={cn(
              "border-border focus-visible:ring-ring border-l px-3 py-2 focus-visible:ring-2 focus-visible:outline-none",
              showAll
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => onShowAllChange(true)}
          >
            All connected · {connectedCount}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PathInspector({
  item,
  standalone = false,
}: {
  item: GraphItem | undefined;
  standalone?: boolean;
}) {
  return (
    <aside
      className={cn(
        "border-border bg-card h-fit border-t",
        standalone && "xl:rounded-md xl:border 2xl:sticky 2xl:top-24",
      )}
    >
      <div className="border-border border-b p-5">
        <p className="data-label">Selected record</p>
        <h2 className="mt-2 text-lg font-semibold">
          {item?.title ?? "No record selected"}
        </h2>
        {item ? (
          <p className="text-muted-foreground mt-2 text-xs font-bold">
            {stageLabel[item.stage]} · {item.status}
          </p>
        ) : null}
      </div>
      {item ? (
        <div className="space-y-5 p-5">
          <p className="text-muted-foreground text-sm leading-6">{item.meta}</p>
          {item.relationship ? (
            <div>
              <p className="data-label">Relationship basis</p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {item.relationship}
              </p>
            </div>
          ) : null}
          {item.quote ? (
            <figure className="border-border border-t border-b py-4">
              <figcaption className="data-label">Exact evidence</figcaption>
              <blockquote className="mt-3 text-sm leading-7 italic">
                “{item.quote}”
              </blockquote>
            </figure>
          ) : null}
          {typeof item.confidence === "number" ? (
            <div>
              <p className="data-label mb-2">Evidence confidence</p>
              <ConfidenceBar value={item.confidence} />
            </div>
          ) : null}
          {item.rationale ? (
            <div>
              <p className="data-label">Review rationale</p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {item.rationale}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground p-5 text-sm">
          Select a record to inspect its evidence and review basis.
        </p>
      )}
    </aside>
  );
}

function UnlinkedRecords({
  items,
  query,
}: {
  items: GraphItem[];
  query: string;
}) {
  if (items.length === 0) return null;
  const visibleItems = items.filter((item) => matchesQuery(item, query));

  return (
    <section className="app-surface mt-4 overflow-hidden">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Unlinked records</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          {items.length} record{items.length === 1 ? " is" : "s are"} in the
          impact set but not connected end to end by reviewed relationships.
          They stay out of the canvas so the proven path remains readable.
        </p>
      </div>
      {visibleItems.length > 0 ? (
        <div className="divide-border divide-y">
          {visibleItems.map((item) => (
            <details key={item.id} className="px-5 py-4">
              <summary className="focus-visible:ring-ring grid cursor-pointer gap-2 text-sm focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[120px_minmax(0,1fr)_160px] sm:items-start sm:gap-4">
                <span className="text-muted-foreground text-xs font-bold">
                  {stageNumber[item.stage]} · {stageLabel[item.stage]}
                </span>
                <span>
                  <strong className="block">{item.title}</strong>
                  <span className="text-muted-foreground mt-1 block text-xs leading-5">
                    {item.meta}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs font-bold sm:text-right">
                  {item.status}
                </span>
              </summary>
              <div className="border-border mt-4 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="data-label">Path status</p>
                  <p className="text-muted-foreground mt-2 leading-6">
                    No complete reviewed source path reaches this record.
                  </p>
                  <p className="text-muted-foreground mt-2 leading-6">
                    {item.relationship}
                  </p>
                </div>
                <div>
                  <p className="data-label">Review basis</p>
                  <p className="text-muted-foreground mt-2 leading-6">
                    {item.rationale ?? "No rationale recorded."}
                  </p>
                  {item.quote ? (
                    <blockquote className="border-border mt-3 border-l pl-3 leading-6 italic">
                      “{item.quote}”
                    </blockquote>
                  ) : null}
                  {typeof item.confidence === "number" ? (
                    <p className="text-muted-foreground mt-2 text-xs font-bold">
                      Evidence confidence {item.confidence}%
                    </p>
                  ) : null}
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground px-5 py-4 text-sm">
          No unlinked record matches the current search.
        </p>
      )}
    </section>
  );
}

function makeEdge(source: GraphItem, target: GraphItem): Edge {
  return {
    id: `${source.id}-${target.id}`,
    source: source.id,
    target: target.id,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: toneColor[target.tone] },
    style: {
      stroke: toneColor[target.tone],
      strokeWidth: 1.5,
      strokeDasharray: target.tone === "uncertain" ? "6 5" : undefined,
      opacity: 0.72,
    },
  };
}

function matchesQuery(item: GraphItem, query: string) {
  return (
    !query ||
    `${item.title} ${item.meta} ${item.status}`.toLowerCase().includes(query)
  );
}

function buildNodes(
  items: GraphItem[],
  selectedId: string | undefined,
  query: string,
  filteredIds: Set<string>,
): Node[] {
  const stageIndexes: Record<GraphItem["stage"], number> = {
    source: 0,
    claim: 0,
    artifact: 0,
    role: 0,
  };

  return items.map((item) => {
    const index = stageIndexes[item.stage]++;
    const selectedNode = item.id === selectedId;
    const dimmed = query.length > 0 && !filteredIds.has(item.id);

    return {
      id: item.id,
      position: { x: stageX[item.stage], y: 64 + index * 148 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      ariaLabel: `${stageLabel[item.stage]}: ${item.title}. ${item.status}`,
      data: {
        label: (
          <div className="w-full min-w-0 text-left">
            <p className="text-[11px] font-bold tracking-[0.06em] uppercase">
              {stageNumber[item.stage]} · {stageLabel[item.stage]}
            </p>
            <p className="mt-1 text-[10px] leading-4 font-bold opacity-70">
              {item.status}
            </p>
            <p className="font-heading mt-2 text-[15px] leading-5 font-semibold [overflow-wrap:anywhere]">
              {item.title}
            </p>
            <p className="mt-2 text-xs leading-4 [overflow-wrap:anywhere] opacity-65">
              {item.meta}
            </p>
          </div>
        ),
      },
      style: {
        color: "var(--foreground)",
        background: "var(--card)",
        border: `${item.tone === "uncertain" ? "1px dashed" : "1px solid"} ${toneColor[item.tone]}`,
        borderRadius: 6,
        width: 228,
        padding: "13px 14px",
        opacity: dimmed ? 0.2 : 1,
        outline: selectedNode ? "2px solid var(--ring)" : undefined,
        outlineOffset: selectedNode ? 3 : undefined,
        transition: "opacity 150ms cubic-bezier(0.23, 1, 0.32, 1)",
      },
    };
  });
}

function buildEdges(items: GraphItem[]): Edge[] {
  const byId = new Map(items.map((item) => [item.id, item]));

  return items.flatMap((target) =>
    (target.parentIds ?? []).flatMap((parentId) => {
      const source = byId.get(parentId);
      return source ? [makeEdge(source, target)] : [];
    }),
  );
}

export function getGraphContextIds(items: GraphItem[], seedIds: Set<string>) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, string[]>();

  for (const item of items) {
    for (const parentId of item.parentIds ?? []) {
      const ids = children.get(parentId) ?? [];
      ids.push(item.id);
      children.set(parentId, ids);
    }
  }

  const context = new Set<string>();
  const seeds = [...seedIds].filter((id) => byId.has(id));
  const ancestors = [...seeds];
  const descendants = [...seeds];
  const descendantIds = new Set<string>();

  while (ancestors.length > 0) {
    const id = ancestors.shift()!;
    if (context.has(id)) continue;
    context.add(id);
    ancestors.push(...(byId.get(id)?.parentIds ?? []));
  }

  while (descendants.length > 0) {
    const id = descendants.shift()!;
    if (descendantIds.has(id)) continue;
    descendantIds.add(id);
    context.add(id);
    descendants.push(...(children.get(id) ?? []));
  }

  return context;
}

export function getReachableIds(items: GraphItem[]) {
  const reachable = new Set(
    items.filter((item) => item.stage === "source").map((item) => item.id),
  );

  for (const stage of stages.slice(1)) {
    for (const item of items.filter((candidate) => candidate.stage === stage)) {
      if ((item.parentIds ?? []).some((parentId) => reachable.has(parentId))) {
        reachable.add(item.id);
      }
    }
  }

  return reachable;
}
