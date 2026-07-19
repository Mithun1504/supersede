import Link from "next/link";
import type { Metadata } from "next";

import { Surface } from "@/components/product/product-shell";
import {
  ChangeEntryForm,
  MutationButton,
} from "@/components/product/governed-actions";
import { SectionTitle } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace, type ProductWorkspace } from "@/modules/product";

export const metadata: Metadata = { title: "Source Change" };

type Change = ProductWorkspace["changes"][number];

export default async function ChangesPage() {
  const data = await getProductWorkspace();

  return (
    <AuthenticatedProductShell
      active="changes"
      title="Source change"
      description="Review the rule being retired, its replacement, and the independent validation that permits impact analysis."
      action={
        data.changes.length ? (
          <Button asChild>
            <Link href="/app/graph">Continue to dependency map</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-6">
        {data.viewer.roles.includes("change_owner") ? (
          <Surface className="overflow-hidden">
            <SectionTitle
              title="Record a source change"
              detail="Creates a versioned draft. A different actor must validate it before propagation."
            />
            <div className="p-5 sm:p-6">
              <ChangeEntryForm
                sourceId={data.change.sourceId}
                oldSourceVersionId={data.change.oldSourceVersionId}
                newSourceVersionId={data.change.newSourceVersionId}
              />
            </div>
          </Surface>
        ) : null}
        {data.changes.length ? (
          data.changes.map((change) => (
            <ChangeDossier
              change={change}
              canValidate={data.viewer.roles.includes("change_validator")}
              key={change.versionId}
            />
          ))
        ) : (
          <Surface className="px-5 py-8 sm:px-6">
            <h2 className="text-lg font-semibold">No source change recorded</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              A change owner must record the retired and replacement rules
              before independent review and propagation can begin.
            </p>
          </Surface>
        )}
      </div>
    </AuthenticatedProductShell>
  );
}

function ChangeDossier({
  change,
  canValidate,
}: {
  change: Change;
  canValidate: boolean;
}) {
  const governance = getGovernanceState(change);

  return (
    <Surface className="overflow-hidden">
      <article aria-labelledby={`change-${change.versionId}`}>
        <ChangeHeader change={change} governance={governance} />
        <RuleRevision change={change} />
        <GovernanceLedger change={change} />
        <footer className="border-border bg-muted/20 grid gap-3 border-t px-5 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
          <p className="text-muted-foreground">{governance.detail}</p>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium tabular-nums">
              {change.impactCount} downstream{" "}
              {pluralize(change.impactCount, "impact record")}
            </p>
            {canValidate && !change.validatedAt ? (
              <MutationButton
                endpoint={`/api/v1/workflow/changes/${change.id}/versions/${change.versionId}/validate`}
                label="Validate and lock"
              />
            ) : null}
          </div>
        </footer>
      </article>
    </Surface>
  );
}

function ChangeHeader({
  change,
  governance,
}: {
  change: Change;
  governance: ReturnType<typeof getGovernanceState>;
}) {
  return (
    <header className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6 sm:py-6">
      <div className="min-w-0">
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          {change.reference} / {change.versionLabel}
        </p>
        <h2
          className="mt-2 text-xl font-semibold text-balance sm:text-2xl"
          id={`change-${change.versionId}`}
        >
          {change.sourceTitle}
        </h2>
      </div>
      <StatusPill tone={governance.tone}>{governance.label}</StatusPill>
    </header>
  );
}

function RuleRevision({ change }: { change: Change }) {
  return (
    <section aria-label="Rule revision" className="border-border border-t">
      <div className="grid lg:grid-cols-2">
        <RuleClause
          disposition="Retired source version"
          label="Old rule"
          text={change.oldRule}
        />
        <RuleClause
          disposition={
            change.lockedAt ? "Current source version" : "Proposed replacement"
          }
          label="New rule"
          text={change.newRule}
          current
        />
      </div>
    </section>
  );
}

function RuleClause({
  disposition,
  label,
  text,
  current = false,
}: {
  disposition: string;
  label: string;
  text: string;
  current?: boolean;
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
      <p className="font-heading mt-4 text-lg leading-8 font-semibold text-pretty">
        {text}
      </p>
      <p
        className={
          current
            ? "text-primary mt-5 text-sm font-bold"
            : "text-muted-foreground mt-5 text-sm font-bold"
        }
      >
        {disposition}
      </p>
    </div>
  );
}

function GovernanceLedger({ change }: { change: Change }) {
  const rows = [
    {
      label: "Change owner",
      value: change.enteredBy,
      detail: `Entered ${formatDate(change.enteredAt)}`,
    },
    {
      label: "Independent reviewer",
      value: change.validatedBy ?? "Not assigned",
      detail:
        change.validatedAt && change.validatedBy
          ? `Validated ${formatDate(change.validatedAt)}`
          : "Validation is still required",
    },
    {
      label: "Version lock",
      value: change.lockedAt ? "Locked" : "Open",
      detail: change.lockedAt
        ? `Locked ${formatDate(change.lockedAt)}`
        : "May still be amended",
    },
  ];

  return (
    <section aria-labelledby={`governance-${change.versionId}`}>
      <h3
        className="border-border border-t px-5 pt-5 text-base font-semibold sm:px-6"
        id={`governance-${change.versionId}`}
      >
        Governance record
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

function getGovernanceState(change: Change) {
  if (!change.validatedAt || !change.validatedBy) {
    return {
      label: "Awaiting independent review",
      detail:
        "Impact propagation remains gated until a second reviewer validates the change.",
      tone: "warning" as const,
    };
  }

  if (!change.lockedAt) {
    return {
      label: "Validated, not locked",
      detail:
        "The source change is validated but remains open to amendment until its version is locked.",
      tone: "plum" as const,
    };
  }

  return {
    label: "Validated and locked",
    detail:
      "The independently validated version is locked and ready for downstream impact review.",
    tone: "success" as const,
  };
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not recorded";
}

function pluralize(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}
