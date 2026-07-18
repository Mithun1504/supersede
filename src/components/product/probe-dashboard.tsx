"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { CheckCircle2, Radio, RefreshCw, Search, Send, X } from "lucide-react";

import { SectionTitle, Surface } from "@/components/product/product-shell";
import { MetricRail } from "@/components/product/product-ui";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProductWorkspace } from "@/modules/product";

type Probe = ProductWorkspace["probes"][number];
type Filter = "all" | "old" | "new" | "other" | "remediation";

export function ProbeDashboard({
  probes,
}: {
  probes: ProductWorkspace["probes"];
}) {
  const [selectedId, setSelectedId] = useState(probes[0]?.assignmentId);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const selected = probes.find((probe) => probe.assignmentId === selectedId);
  const visible = useMemo(
    () =>
      probes.filter((probe) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "remediation"
            ? Boolean(probe.remediationAssignmentId)
            : probe.answeredWith === filter);
        const matchesQuery =
          !deferredQuery ||
          `${probe.personName} ${probe.professionalRole} ${probe.scenario}`
            .toLowerCase()
            .includes(deferredQuery);
        return matchesFilter && matchesQuery;
      }),
    [deferredQuery, filter, probes],
  );

  const metrics = [
    {
      label: "Assigned",
      value: probes.length,
      detail: "Persisted assignments",
      icon: Radio,
      tone: "primary" as const,
    },
    {
      label: "Delivered",
      value: probes.filter((probe) => probe.deliveryStatus !== null).length,
      detail: "Delivery evidence recorded",
      icon: Send,
      tone: "cyan" as const,
    },
    {
      label: "Assessed",
      value: probes.filter((probe) => probe.responseId).length,
      detail: "Persisted responses",
      icon: CheckCircle2,
      tone: "success" as const,
    },
    {
      label: "Rechecks complete",
      value: probes.reduce((sum, probe) => sum + probe.recheckCompleted, 0),
      detail: "Different-case rechecks",
      icon: RefreshCw,
      tone: "warning" as const,
    },
  ];

  return (
    <div className="grid gap-4">
      <MetricRail items={metrics} connected />
      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface className="min-w-0 overflow-hidden">
          <SectionTitle
            title="Governed probe assignments"
            detail="Assignment, delivery, response, remediation, and recheck state joined from persisted records."
          />
          <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search probe assignments</span>
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search probes…"
                className="pl-9"
              />
            </label>
            <div
              className="scrollbar-subtle flex gap-2 overflow-x-auto pb-1"
              aria-label="Probe filters"
            >
              {(["all", "old", "new", "other", "remediation"] as const).map(
                (value) => (
                  <Button
                    key={value}
                    variant={filter === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(value)}
                  >
                    {value === "all"
                      ? "All"
                      : value === "remediation"
                        ? "Remediation"
                        : `Answered ${value}`}
                  </Button>
                ),
              )}
            </div>
          </div>
          <div className="divide-border/70 divide-y">
            {visible.map((probe) => (
              <ProbeRow
                key={probe.assignmentId}
                probe={probe}
                selected={probe.assignmentId === selectedId}
                onSelect={() => setSelectedId(probe.assignmentId)}
              />
            ))}
            {!visible.length ? (
              <p className="text-muted-foreground p-8 text-center text-sm">
                No persisted assignments match these filters.
              </p>
            ) : null}
          </div>
        </Surface>
        <ProbeInspector
          probe={selected}
          onClose={() => setSelectedId(undefined)}
        />
      </section>
    </div>
  );
}

function ProbeRow({
  probe,
  selected,
  onSelect,
}: {
  probe: Probe;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "content-auto hover:bg-muted/35 grid w-full gap-4 p-4 text-left transition-colors sm:p-5 lg:grid-cols-[190px_minmax(0,1fr)_150px]",
        selected && "bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]",
      )}
    >
      <div>
        <h2 className="font-semibold">{probe.personName}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {probe.professionalRole}
        </p>
        <p className="text-muted-foreground mt-1 font-mono text-[10px]">
          {probe.assignmentId.slice(0, 8)}
        </p>
      </div>
      <div>
        <p className="line-clamp-2 text-sm leading-6">{probe.scenario}</p>
        <p className="text-muted-foreground mt-2 line-clamp-1 text-xs">
          {probe.responseText
            ? `Response: ${probe.responseText}`
            : "Awaiting response"}
        </p>
      </div>
      <div className="space-y-2">
        <StatusPill
          tone={
            !probe.responseId
              ? "neutral"
              : probe.answeredWith === "new"
                ? "success"
                : probe.answeredWith === "other"
                  ? "warning"
                  : "warning"
          }
        >
          {probe.responseId
            ? `Answered ${probe.answeredWith}`
            : (probe.deliveryStatus ?? "assigned")}
        </StatusPill>
        {probe.gradingConfidence !== null ? (
          <p className="text-muted-foreground text-xs">
            Confidence {Math.round(probe.gradingConfidence * 100)}%
          </p>
        ) : null}
      </div>
    </button>
  );
}

function ProbeInspector({
  probe,
  onClose,
}: {
  probe: Probe | undefined;
  onClose: () => void;
}) {
  return (
    <Surface className="h-fit overflow-hidden xl:sticky xl:top-24">
      <div className="border-border/70 flex items-start justify-between border-b p-5">
        <div>
          <p className="data-label">Assignment detail</p>
          <h2 className="mt-2 text-lg font-semibold">
            {probe?.personName ?? "Select an assignment"}
          </h2>
          {probe ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {probe.professionalRole}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close assignment detail"
        >
          <X />
        </Button>
      </div>
      {probe ? (
        <div className="space-y-5 p-5">
          <InspectorField
            label="Delivery evidence"
            value={probe.deliveryStatus ?? "Assigned"}
          />
          <InspectorField label="Prompt / scenario" value={probe.scenario} />
          <InspectorField
            label="Response"
            value={probe.responseText ?? "Awaiting response"}
          />
          <InspectorField
            label="Grading rationale"
            value={
              probe.gradingConfidence === null
                ? "Not assessed"
                : `Grading confidence ${Math.round(probe.gradingConfidence * 100)}%`
            }
          />
          <InspectorField
            label="Remediation status"
            value={probe.remediationStatus ?? "Not required"}
          />
          <div>
            <p className="data-label">Recheck schedule</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {probe.recheckScheduled} scheduled · {probe.recheckCompleted}{" "}
              complete
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="border-border bg-muted/25 rounded-lg border px-3 py-2 text-center text-xs font-medium">
                30-day recheck
              </span>
              <span className="border-border bg-muted/25 rounded-lg border px-3 py-2 text-center text-xs font-medium">
                90-day recheck
              </span>
            </div>
            <p className="border-primary/20 bg-primary/5 text-muted-foreground mt-3 rounded-lg border p-3 text-xs leading-5">
              A different approved case is required for every recheck.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground p-5 text-sm">
          Choose a persisted assignment to inspect its evidence and lifecycle.
        </p>
      )}
    </Surface>
  );
}

function InspectorField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="data-label">{label}</p>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{value}</p>
    </div>
  );
}
