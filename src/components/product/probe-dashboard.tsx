"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";

import { SectionTitle, Surface } from "@/components/product/product-shell";
import { ProbeResponseActions } from "@/components/product/governed-actions";
import { StatusPill } from "@/components/product/status";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProductWorkspace } from "@/modules/product";

type Probe = ProductWorkspace["probes"][number];
type QueueFilter = "all" | "attention" | "remediation" | "recheck" | "closed";
type ProbeSummary = {
  assigned: number;
  delivered: number;
  responded: number;
  assessed: number;
  remediationAssigned: number;
  remediated: number;
  recheckScheduled: number;
  rechecked: number;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Not set";
}

function formatToken(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Not recorded";
}

function ratio(value: number, total: number) {
  return total ? `${value}/${total}` : "0";
}

function queueState(probe: Probe) {
  if (probe.recheckScheduled > 0) {
    return { label: "Recheck open", tone: "plum" as const };
  }
  if (probe.recheckCompleted > 0) {
    return { label: "Recheck complete", tone: "success" as const };
  }
  if (probe.remediationAssignmentId) {
    if (probe.remediationStatus === "passed") {
      return { label: "Remediation passed", tone: "success" as const };
    }
    if (probe.remediationStatus === "failed") {
      return { label: "Follow-up required", tone: "danger" as const };
    }
    return {
      label: `Remediation ${formatToken(probe.remediationStatus)}`,
      tone: "warning" as const,
    };
  }
  if (probe.responseId) {
    if (probe.reviewRequired) {
      return { label: "Assessment review", tone: "warning" as const };
    }
    return probe.gradingConfidence === null
      ? { label: "Awaiting assessment", tone: "warning" as const }
      : { label: "Assessment complete", tone: "neutral" as const };
  }
  if (probe.deliveryStatus === "bounced") {
    return { label: "Delivery bounced", tone: "danger" as const };
  }
  if (
    probe.deliveryStatus === "opened" ||
    probe.deliveryStatus === "completed"
  ) {
    return { label: "Awaiting response", tone: "neutral" as const };
  }
  if (probe.deliveryStatus === "assigned") {
    return { label: "Awaiting delivery", tone: "neutral" as const };
  }
  return { label: "Assigned", tone: "neutral" as const };
}

function matchesFilter(probe: Probe, filter: QueueFilter) {
  if (filter === "attention") {
    return (
      probe.reviewRequired === true ||
      probe.deliveryStatus === "bounced" ||
      probe.remediationStatus === "failed" ||
      (Boolean(probe.responseId) && probe.gradingConfidence === null)
    );
  }
  if (filter === "remediation") return Boolean(probe.remediationAssignmentId);
  if (filter === "recheck") {
    return probe.recheckScheduled > 0 || probe.recheckCompleted > 0;
  }
  if (filter === "closed") {
    return probe.recheckCompleted > 0 && probe.recheckScheduled === 0;
  }
  return true;
}

export function ProbeDashboard({
  probes,
  summary,
  individualResultsVisible,
  learnerName,
}: {
  probes: ProductWorkspace["probes"];
  summary: ProbeSummary;
  individualResultsVisible: boolean;
  learnerName?: string;
}) {
  const [selectedId, setSelectedId] = useState(probes[0]?.assignmentId);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const visible = useMemo(
    () =>
      probes.filter((probe) => {
        const searchText = [
          probe.personName,
          probe.professionalRole,
          probe.scenario,
          probe.responseText,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          matchesFilter(probe, filter) &&
          (!deferredQuery || searchText.includes(deferredQuery))
        );
      }),
    [deferredQuery, filter, probes],
  );
  const selected =
    visible.find((probe) => probe.assignmentId === selectedId) ?? visible[0];

  return (
    <div className="grid gap-5">
      <LifecycleLedger summary={summary} />
      {individualResultsVisible ? (
        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Surface className="min-w-0 overflow-hidden">
            <SectionTitle
              title="Assignment queue"
              detail="Persisted delivery, response, assessment, remediation, and recheck evidence for the active change."
            />
            <div className="border-border grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_190px] sm:px-5">
              <label>
                <span className="sr-only">Search assignments</span>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search person, role, or scenario"
                />
              </label>
              <label>
                <span className="sr-only">Filter assignment queue</span>
                <select
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as QueueFilter)
                  }
                >
                  <option value="all">All assignments</option>
                  <option value="attention">Needs attention</option>
                  <option value="remediation">In remediation</option>
                  <option value="recheck">Recheck evidence</option>
                  <option value="closed">Recheck complete</option>
                </select>
              </label>
            </div>
            <div className="divide-border divide-y">
              {visible.map((probe) => (
                <AssignmentRow
                  key={probe.assignmentId}
                  probe={probe}
                  selected={probe.assignmentId === selected?.assignmentId}
                  onSelect={() => setSelectedId(probe.assignmentId)}
                />
              ))}
              {!visible.length ? (
                <p className="text-muted-foreground p-8 text-center text-sm">
                  No persisted assignments match this view.
                </p>
              ) : null}
            </div>
            <p className="text-muted-foreground border-border border-t px-5 py-3 text-xs leading-5">
              This is a review workspace. Learners respond through their
              governed delivery link; no response is simulated here.
            </p>
          </Surface>
          <div id="assignment-inspector">
            <AssignmentInspector
              probe={selected}
              canRespond={Boolean(
                learnerName && selected?.personName === learnerName,
              )}
            />
          </div>
        </section>
      ) : (
        <Surface className="overflow-hidden">
          <SectionTitle
            title="Individual evidence restricted"
            detail="Organization policy exposes aggregate outcomes only."
          />
          <p className="text-muted-foreground max-w-2xl px-5 py-5 text-sm leading-6">
            Names, responses, and assignment-level remediation records are not
            shown in this workspace. The closure sequence above remains an
            aggregate of persisted workflow events.
          </p>
        </Surface>
      )}
    </div>
  );
}

function LifecycleLedger({ summary }: { summary: ProbeSummary }) {
  const {
    assigned,
    delivered,
    responded,
    assessed,
    remediationAssigned,
    remediated,
    recheckScheduled,
    rechecked,
  } = summary;
  const steps = [
    ["Assigned", String(assigned), "governed assignments"],
    ["Delivered", ratio(delivered, assigned), "delivery evidence"],
    ["Responded", ratio(responded, assigned), "learner responses"],
    ["Assessed", ratio(assessed, responded), "recorded assessments"],
    ["Remediated", ratio(remediated, remediationAssigned), "passed work"],
    [
      "Rechecked",
      ratio(rechecked, recheckScheduled + rechecked),
      "different cases",
    ],
  ] as const;

  return (
    <Surface className="overflow-hidden">
      <SectionTitle
        title="Closure sequence"
        detail="A learner closes only after a completed recheck uses a different approved case."
      />
      <ol
        className="scrollbar-subtle focus-visible:ring-ring divide-border flex divide-x overflow-x-auto focus-visible:ring-3 focus-visible:outline-none"
        aria-label="Remediation closure sequence"
        tabIndex={0}
      >
        {steps.map(([label, value, detail], index) => (
          <li className="min-w-40 flex-1 px-4 py-4" key={label}>
            <p className="data-label">
              {String(index + 1).padStart(2, "0")} · {label}
            </p>
            <p className="font-heading mt-3 text-2xl font-semibold tabular-nums">
              {value}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
          </li>
        ))}
      </ol>
    </Surface>
  );
}

function AssignmentRow({
  probe,
  selected,
  onSelect,
}: {
  probe: Probe;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = queueState(probe);
  const evidence = probe.responseText
    ? `Response recorded · answered ${formatToken(probe.answeredWith)}`
    : probe.deliveryStatus
      ? `Delivery ${formatToken(probe.deliveryStatus)}`
      : "No delivery evidence yet";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-controls="assignment-inspector"
      className={cn(
        "hover:bg-muted/45 focus-visible:ring-ring grid w-full gap-3 p-4 text-left transition-colors duration-150 focus-visible:ring-3 focus-visible:outline-none sm:px-5 lg:grid-cols-[170px_minmax(0,1fr)_170px] lg:items-center",
        selected && "bg-muted/70",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {probe.personName}
        </span>
        <span className="text-muted-foreground mt-1 block truncate text-xs">
          {probe.professionalRole}
        </span>
        {selected ? (
          <span className="mt-2 block text-xs font-semibold">Selected</span>
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 block text-sm leading-6">
          {probe.scenario}
        </span>
        <span className="text-muted-foreground mt-1 block text-xs">
          {evidence}
        </span>
      </span>
      <span className="flex items-center justify-between gap-3 lg:block">
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
        <span className="text-muted-foreground mt-0 block text-xs lg:mt-2">
          Due {formatDate(probe.dueAt)}
        </span>
      </span>
    </button>
  );
}

function AssignmentInspector({
  probe,
  canRespond,
}: {
  probe: Probe | undefined;
  canRespond: boolean;
}) {
  return (
    <Surface className="h-fit overflow-hidden xl:sticky xl:top-24">
      <SectionTitle
        title={probe?.personName ?? "Assignment evidence"}
        detail={
          probe
            ? probe.professionalRole
            : "Select an assignment to inspect its persisted lifecycle."
        }
      />
      {probe ? (
        <div className="divide-border divide-y">
          <EvidenceSection title="Assignment and delivery">
            <EvidenceRow
              label="Assignment ID"
              value={probe.assignmentId}
              mono
            />
            <EvidenceRow
              label="Assigned"
              value={formatDate(probe.assignedAt)}
            />
            <EvidenceRow label="Due" value={formatDate(probe.dueAt)} />
            <EvidenceRow
              label="Delivery"
              value={formatToken(probe.deliveryStatus)}
            />
            <EvidenceRow
              label="Case version"
              value={probe.caseVersionId}
              mono
            />
          </EvidenceSection>
          <EvidenceSection title="Response and assessment">
            <p className="text-sm leading-6">{probe.scenario}</p>
            <EvidenceRow
              label="Learner response"
              value={probe.responseText ?? "Awaiting learner response"}
            />
            <EvidenceRow
              label="Classified answer"
              value={formatToken(probe.answeredWith)}
            />
            <EvidenceRow label="Current answer" value={probe.newAnswer} />
            <EvidenceRow label="Assessment basis" value={probe.caseRationale} />
            <EvidenceRow
              label="Assessment confidence"
              value={
                probe.gradingConfidence === null
                  ? "Not assessed"
                  : `${Math.round(probe.gradingConfidence * 100)}%`
              }
            />
            <EvidenceRow
              label="Reviewer attention"
              value={probe.reviewRequired ? "Required" : "Not flagged"}
            />
            <p className="text-muted-foreground text-xs leading-5">
              Assessment confidence routes reviewer attention; it does not
              establish correctness on its own.
            </p>
          </EvidenceSection>
          <EvidenceSection title="Corrective work">
            <EvidenceRow
              label="Status"
              value={formatToken(probe.remediationStatus)}
            />
            <EvidenceRow
              label="Assigned artifact"
              value={probe.remediationArtifactText ?? "No remediation assigned"}
            />
            <EvidenceRow
              label="Latest feedback"
              value={probe.remediationFeedback ?? "No feedback recorded"}
            />
          </EvidenceSection>
          <EvidenceSection title="Different-case recheck">
            <div className="grid grid-cols-2 gap-4">
              <EvidenceCount label="Open" value={probe.recheckScheduled} />
              <EvidenceCount label="Completed" value={probe.recheckCompleted} />
            </div>
            <p className="text-muted-foreground text-xs leading-5">
              The recheck must use another approved case. Repeating the original
              case does not close this assignment.
            </p>
          </EvidenceSection>
          {canRespond ? (
            <EvidenceSection title="Governed learner action">
              <ProbeResponseActions
                assignmentId={probe.assignmentId}
                remediationAssignmentId={probe.remediationAssignmentId}
                hasResponse={Boolean(probe.responseId)}
                remediationPassed={probe.remediationStatus === "passed"}
              />
            </EvidenceSection>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground p-5 text-sm">
          No assignment is selected in the current queue view.
        </p>
      )}
    </Surface>
  );
}

function EvidenceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 p-5">
      <h3 className="data-label">{title}</h3>
      {children}
    </section>
  );
}

function EvidenceRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "min-w-0 text-sm leading-5 [overflow-wrap:anywhere]",
          mono && "font-mono text-xs break-all",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EvidenceCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-heading text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </div>
  );
}
