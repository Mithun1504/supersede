"use client";

import type { GraphItem } from "@/components/product/interactive-graph";
import { cn } from "@/lib/utils";

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

export function MobileGraphPaths({
  items,
  query,
  selectedId,
  onSelect,
}: {
  items: GraphItem[];
  query: string;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const paths = buildArtifactPaths(items).filter((path) =>
    path.records.some((item) => matchesQuery(item, query)),
  );

  if (paths.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        No connected path record matches “{query}”.
      </p>
    );
  }

  return (
    <div className="divide-border divide-y">
      {paths.map((path, index) => (
        <section className="p-4" key={path.id}>
          <p className="data-label">
            Path {String(index + 1).padStart(2, "0")} · {path.title}
          </p>
          <ol className="border-border mt-3 border-t">
            {path.records.map((item) => (
              <MobilePathRecord
                item={item}
                key={item.id}
                selected={item.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function MobilePathRecord({
  item,
  selected,
  onSelect,
}: {
  item: GraphItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li className="border-border grid grid-cols-[32px_minmax(0,1fr)] border-b py-3">
      <span
        className="text-primary pt-0.5 font-mono text-xs"
        aria-hidden="true"
      >
        {stageNumber[item.stage]}
      </span>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(item.id)}
        className={cn(
          "focus-visible:ring-ring min-w-0 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none",
          selected && "text-primary",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-semibold">{item.title}</span>
          <span className="text-muted-foreground shrink-0 text-xs">
            {stageLabel[item.stage]}
          </span>
        </span>
        <span className="text-muted-foreground mt-1 block text-xs leading-5">
          {item.meta} · {item.status}
        </span>
      </button>
    </li>
  );
}

function buildArtifactPaths(items: GraphItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const artifacts = items.filter((item) => item.stage === "artifact");

  if (artifacts.length === 0) {
    return [{ id: "partial", title: "Partial reviewed path", records: items }];
  }

  return artifacts.map((artifact) => {
    const claims = (artifact.parentIds ?? []).flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    const sources = claims.flatMap((claim) =>
      (claim.parentIds ?? []).flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      }),
    );
    const roles = items.filter(
      (item) =>
        item.stage === "role" && (item.parentIds ?? []).includes(artifact.id),
    );

    return {
      id: artifact.id,
      title: artifact.title,
      records: uniqueById([...sources, ...claims, artifact, ...roles]),
    };
  });
}

function uniqueById(items: GraphItem[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function matchesQuery(item: GraphItem, query: string) {
  return (
    !query ||
    `${item.title} ${item.meta} ${item.status}`.toLowerCase().includes(query)
  );
}
