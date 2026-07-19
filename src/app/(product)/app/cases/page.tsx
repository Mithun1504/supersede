import Link from "next/link";
import type { Metadata } from "next";

import { Surface } from "@/components/product/product-shell";
import {
  CaseDraftForm,
  MutationButton,
} from "@/components/product/governed-actions";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace, type ProductWorkspace } from "@/modules/product";

export const metadata: Metadata = { title: "Decision Cases" };

type DecisionCase = ProductWorkspace["cases"][number];

export default async function CasesPage() {
  const data = await getProductWorkspace();
  const hasRemediationAssignments = data.probes.some((probe) =>
    data.cases.some(
      (item) =>
        item.versionId === probe.caseVersionId && isReleaseEligible(item),
    ),
  );

  return (
    <AuthenticatedProductShell
      active="cases"
      title="Decision cases"
      description="Inspect where the retired and current rules produce different decisions, plus the approved evidence locked for remediation."
      action={
        hasRemediationAssignments ? (
          <Button asChild>
            <Link href="/app/probes">Open remediation assignments</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-6">
        {data.viewer.roles.includes("change_owner") ? (
          <Surface className="overflow-hidden">
            <div className="border-border border-b px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold">Draft a decision case</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                Author a versioned old-rule/new-rule boundary with exact source
                citations. Independent approval remains mandatory.
              </p>
            </div>
            <div className="p-5 sm:p-6">
              <CaseDraftForm
                changeEventId={data.change.id}
                changeEventVersionId={data.change.versionId}
                oldSourceVersionId={data.change.oldSourceVersionId}
                newSourceVersionId={data.change.newSourceVersionId}
              />
            </div>
          </Surface>
        ) : null}
        {data.cases.length ? (
          data.cases.map((item) => (
            <DecisionCaseDossier
              item={item}
              canApprove={data.viewer.roles.includes("case_approver")}
              canRelease={data.viewer.roles.includes("release_authorizer")}
              key={item.versionId}
            />
          ))
        ) : (
          <Surface className="px-5 py-8 sm:px-6">
            <h2 className="text-lg font-semibold">No decision case authored</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              Author a case where the retired and current rules produce
              different answers, then submit that exact version for approval.
            </p>
          </Surface>
        )}
      </div>
    </AuthenticatedProductShell>
  );
}

function DecisionCaseDossier({
  item,
  canApprove,
  canRelease,
}: {
  item: DecisionCase;
  canApprove: boolean;
  canRelease: boolean;
}) {
  const release = getReleaseState(item);

  return (
    <Surface className="overflow-hidden">
      <article aria-labelledby={`case-${item.versionId}`}>
        <CaseHeader item={item} release={release} />
        <DecisionBoundary item={item} />
        <ApprovalLedger item={item} />
        <footer className="border-border bg-muted/20 grid gap-3 border-t px-5 py-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-6">
          <p className="font-bold">Release policy</p>
          <p className="text-muted-foreground">{release.detail}</p>
          {canApprove && item.status === "draft" && !item.ambiguityNote ? (
            <MutationButton
              endpoint={`/api/v1/workflow/cases/${item.id}/versions/${item.versionId}/approve`}
              label="Approve and lock"
            />
          ) : canRelease && isReleaseEligible(item) ? (
            <MutationButton
              endpoint={`/api/v1/workflow/cases/${item.id}/versions/${item.versionId}/release`}
              label="Release to probes"
            />
          ) : null}
        </footer>
      </article>
    </Surface>
  );
}

function CaseHeader({
  item,
  release,
}: {
  item: DecisionCase;
  release: ReturnType<typeof getReleaseState>;
}) {
  return (
    <header className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6 sm:py-6">
      <div className="min-w-0">
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          Case {item.id.slice(0, 8)} / {item.versionLabel}
        </p>
        <h2
          className="mt-2 max-w-4xl text-xl font-semibold text-balance sm:text-2xl"
          id={`case-${item.versionId}`}
        >
          {item.scenario}
        </h2>
      </div>
      <StatusPill tone={release.tone}>{release.label}</StatusPill>
    </header>
  );
}

function DecisionBoundary({ item }: { item: DecisionCase }) {
  return (
    <section aria-labelledby={`boundary-${item.versionId}`}>
      <h3
        className="border-border border-t px-5 pt-5 text-base font-semibold sm:px-6"
        id={`boundary-${item.versionId}`}
      >
        Decision boundary
      </h3>
      <p className="text-muted-foreground px-5 pt-2 text-sm leading-6 sm:px-6">
        {item.rationale}
      </p>
      <div className="border-border mt-5 grid border-t lg:grid-cols-2">
        <DecisionAnswer
          citation={item.oldCitation}
          label="Old rule outcome"
          outcome={item.oldAnswer}
        />
        <DecisionAnswer
          citation={item.newCitation}
          current
          label="New rule outcome"
          outcome={item.newAnswer}
        />
      </div>
      {item.ambiguityNote ? (
        <div className="border-border grid gap-1 border-t px-5 py-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-6">
          <p className="font-bold">Review note</p>
          <p className="text-warning-foreground dark:text-warning">
            {item.ambiguityNote}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function DecisionAnswer({
  citation,
  current = false,
  label,
  outcome,
}: {
  citation: Record<string, unknown>;
  current?: boolean;
  label: string;
  outcome: string;
}) {
  return (
    <div
      className={
        current
          ? "border-border bg-primary/[0.035] border-t p-5 sm:p-6 lg:border-t-0 lg:border-l"
          : "bg-muted/15 p-5 sm:p-6"
      }
    >
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="font-heading mt-3 text-xl leading-8 font-semibold text-pretty">
        {outcome}
      </p>
      <CitationRecord citation={citation} />
    </div>
  );
}

function CitationRecord({ citation }: { citation: Record<string, unknown> }) {
  const entries = Object.entries(citation);

  return (
    <dl className="border-border mt-6 grid gap-3 border-t pt-4">
      {entries.length ? (
        entries.map(([key, value]) => (
          <div
            className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]"
            key={key}
          >
            <dt className="text-muted-foreground text-xs">
              {humanizeKey(key)}
            </dt>
            <dd className="font-mono text-xs leading-5 break-words">
              {formatCitationValue(value)}
            </dd>
          </div>
        ))
      ) : (
        <div>
          <dt className="text-muted-foreground text-xs">Citation</dt>
          <dd className="mt-1 text-xs">Retained in the locked record</dd>
        </div>
      )}
    </dl>
  );
}

function ApprovalLedger({ item }: { item: DecisionCase }) {
  const rows = [
    {
      label: "Case author",
      value: item.author,
      detail: "Authored this comparison",
    },
    {
      label: "Independent approval",
      value: item.approver ?? "Not approved",
      detail: item.approvedAt
        ? `Approved ${formatDate(item.approvedAt)}`
        : "Approval is still required",
    },
    {
      label: "Version lock",
      value: item.lockedAt ? "Locked" : "Open",
      detail: item.lockedAt
        ? `Locked ${formatDate(item.lockedAt)}`
        : "Not eligible for learner delivery",
    },
  ];

  return (
    <section aria-labelledby={`approval-${item.versionId}`}>
      <h3
        className="border-border border-t px-5 pt-5 text-base font-semibold sm:px-6"
        id={`approval-${item.versionId}`}
      >
        Approval and version lock
      </h3>
      <dl className="divide-border grid divide-y px-5 py-3 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
        {rows.map((row) => (
          <div className="py-3 sm:px-5 sm:first:pl-0" key={row.label}>
            <dt className="text-muted-foreground text-xs font-medium">
              {row.label}
            </dt>
            <dd className="mt-2 text-sm font-bold">{row.value}</dd>
            <dd className="text-muted-foreground mt-1 text-xs leading-5">
              {row.detail}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function isReleaseEligible(item: DecisionCase) {
  return (
    item.status === "approved" && Boolean(item.lockedAt) && !item.ambiguityNote
  );
}

function getReleaseState(item: DecisionCase) {
  if (item.status === "retired") {
    return {
      label: "Retired",
      detail:
        "This version is retained for audit history and cannot be delivered.",
      tone: "neutral" as const,
    };
  }

  if (item.ambiguityNote) {
    return {
      label: "Ambiguous, blocked",
      detail:
        "Ambiguous cases cannot be approved or delivered. Retire this version and author a clearer decision boundary.",
      tone: "warning" as const,
    };
  }

  if (item.status !== "approved") {
    return {
      label: "Awaiting approval",
      detail:
        "A case approver must approve this exact version before it can be used in remediation.",
      tone: "warning" as const,
    };
  }

  if (!item.lockedAt) {
    return {
      label: "Approved, not locked",
      detail:
        "Approval is recorded, but delivery remains blocked until this exact case version is locked.",
      tone: "plum" as const,
    };
  }

  return {
    label: "Approved and locked",
    detail:
      "This exact version is eligible for separate release authorization. Rechecks must use a different approved case.",
    tone: "success" as const,
  };
}

function humanizeKey(value: string) {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatCitationValue(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return value === null
    ? "Not recorded"
    : (JSON.stringify(value) ?? "Recorded");
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not recorded";
}
