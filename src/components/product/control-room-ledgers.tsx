import Link from "next/link";

import { Surface } from "@/components/product/product-shell";
import { Button } from "@/components/ui/button";
import type { ProductWorkspace } from "@/modules/product";

export type WorkflowState =
  "complete" | "action" | "pending" | "prepared" | "not-applicable";

export type WorkflowStep = {
  step: string;
  title: string;
  evidence: string;
  state: WorkflowState;
  stateLabel: string;
  href: string;
};

export type Blocker = {
  step: string;
  title: string;
  detail: string;
  href: string;
};

export type ArtifactImpact = ProductWorkspace["impacts"][number] & {
  artifactId: string;
  artifactTitle: string;
  artifactKind: string;
  artifactVersionLabel: string;
};

export function DossierHeader({
  data,
  blockers,
}: {
  data: ProductWorkspace;
  blockers: number;
}) {
  const changeState = data.change.validatedAt
    ? data.change.lockedAt
      ? "Validated and version locked"
      : "Validated; version lock pending"
    : "Awaiting second-person validation";

  return (
    <Surface className="overflow-hidden">
      <div className="bg-primary text-primary-foreground grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)] lg:items-end">
        <div className="min-w-0">
          <p className="font-mono text-xs tabular-nums opacity-75">
            {data.change.reference} / {data.change.versionLabel}
          </p>
          <h2 className="mt-3 max-w-[24ch] text-2xl leading-tight font-semibold text-pretty sm:text-3xl">
            {data.change.sourceTitle}
          </h2>
          <p className="mt-3 max-w-[62ch] text-sm leading-6 opacity-80">
            {data.change.affectedPopulation}
          </p>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-1">
          <DataPoint label="Dossier state" value={changeState} />
          <DataPoint
            label="Closure"
            value={
              blockers === 0
                ? "No unresolved workflow decisions"
                : `${blockers} unresolved ${blockers === 1 ? "decision" : "decisions"}`
            }
          />
        </dl>
      </div>
      <dl className="divide-border grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <ActorRecord
          role="Entered by"
          name={data.change.enteredBy}
          date={data.change.enteredAt}
        />
        <ActorRecord
          role="Validated by"
          name={data.change.validatedBy ?? "Unassigned"}
          date={data.change.validatedAt}
        />
      </dl>
    </Surface>
  );
}

export function RuleRevision({ data }: { data: ProductWorkspace }) {
  return (
    <Surface>
      <SectionHeading
        title="Rule revision"
        detail={`${data.change.oldSourceSummary} ${data.change.newSourceSummary}`}
      />
      <dl className="divide-border divide-y">
        <RuleRecord
          term="From"
          version={data.change.oldSourceVersionLabel}
          effectiveDate={data.change.oldEffectiveDate}
          rule={data.change.oldRule}
          muted
        />
        <RuleRecord
          term="To"
          version={data.change.newSourceVersionLabel}
          effectiveDate={data.change.newEffectiveDate}
          rule={data.change.newRule}
        />
      </dl>
    </Surface>
  );
}

export function WorkflowRow({ item }: { item: WorkflowStep }) {
  const stateClass =
    item.state === "complete"
      ? "text-success"
      : item.state === "action"
        ? "text-destructive"
        : item.state === "prepared"
          ? "text-primary"
          : "text-muted-foreground";

  return (
    <li className="border-border grid gap-3 border-b px-4 py-4 last:border-0 sm:grid-cols-[2.5rem_minmax(9rem,0.8fr)_minmax(14rem,1.5fr)_auto] sm:items-center sm:px-6">
      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {item.step}
      </span>
      <Link
        className="focus-visible:ring-ring w-fit rounded-sm font-semibold focus-visible:ring-3"
        href={item.href}
      >
        {item.title}
      </Link>
      <p className="text-muted-foreground text-sm leading-5">{item.evidence}</p>
      <span className={`text-xs font-bold ${stateClass}`}>
        {item.stateLabel}
      </span>
    </li>
  );
}

export function NextDecision({ blocker }: { blocker: Blocker | undefined }) {
  return (
    <div className="bg-secondary/65 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Next decision</h2>
      {blocker ? (
        <div className="mt-6">
          <p className="text-primary font-mono text-xs tabular-nums">
            Step {blocker.step}
          </p>
          <p className="mt-2 text-xl leading-snug font-semibold text-pretty">
            {blocker.title}
          </p>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {blocker.detail}
          </p>
          <Button asChild className="mt-5" size="sm">
            <Link href={blocker.href}>Inspect step {blocker.step}</Link>
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm leading-6">
          The workflow has no unresolved decisions. Verify the locked export in
          the audit trail.
        </p>
      )}
    </div>
  );
}

export function BlockerQueue({ blockers }: { blockers: Blocker[] }) {
  return (
    <div className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Open blockers</h2>
      {blockers.length ? (
        <ol className="border-border mt-4 divide-y border-y">
          {blockers.map((blocker) => (
            <li
              className="grid gap-2 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-start"
              key={`${blocker.step}-${blocker.title}`}
            >
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {blocker.step}
              </span>
              <span>
                <strong className="block text-sm">{blocker.title}</strong>
                <span className="text-muted-foreground mt-1 block text-sm leading-5">
                  {blocker.detail}
                </span>
              </span>
              <Link
                className="text-primary focus-visible:ring-ring w-fit rounded-sm text-sm font-bold focus-visible:ring-3"
                href={blocker.href}
              >
                Review
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          No open blockers recorded.
        </p>
      )}
    </div>
  );
}

export function ImpactTable({
  artifacts,
  exposures,
}: {
  artifacts: ArtifactImpact[];
  exposures: ProductWorkspace["exposures"];
}) {
  return (
    <div
      className="scrollbar-subtle overflow-x-auto"
      role="region"
      aria-label="Impacted obligations and potential exposure"
      tabIndex={0}
    >
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="px-6 py-3 font-bold">Obligation</th>
            <th className="px-4 py-3 font-bold">Current triage</th>
            <th className="px-4 py-3 font-bold">Owner</th>
            <th className="px-4 py-3 font-bold">Potential exposure</th>
          </tr>
        </thead>
        <tbody>
          {artifacts.length === 0 ? (
            <tr className="border-border border-t">
              <td className="text-muted-foreground px-6 py-6" colSpan={4}>
                No impacted obligations are recorded for this change version.
              </td>
            </tr>
          ) : null}
          {artifacts.map((impact) => {
            const linkedExposure = exposures.filter(
              (item) => item.artifactVersionId === impact.objectId,
            );
            const people = linkedExposure.reduce(
              (sum, item) => sum + item.peopleCount,
              0,
            );
            return (
              <tr className="border-border border-t" key={impact.id}>
                <td className="max-w-md px-6 py-4 align-top">
                  <p className="font-semibold">{impact.artifactTitle}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {impact.artifactVersionLabel} · {impact.rationale}
                  </p>
                </td>
                <td className="px-4 py-4 align-top">
                  <Disposition impact={impact} />
                </td>
                <td className="px-4 py-4 align-top">
                  {impact.artifactOwner ?? "Unassigned"}
                </td>
                <td className="text-muted-foreground px-4 py-4 align-top">
                  <p>{people} people</p>
                  <p className="mt-1 text-xs">
                    {linkedExposure.map((item) => item.roleName).join(", ") ||
                      "No role mapping"}
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PolicyStrip({ data }: { data: ProductWorkspace }) {
  const displace = data.organization.configuration === "displace";
  return (
    <Surface className="bg-border grid gap-px overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
      <PolicyRecord
        label="Organization"
        value={data.organization.name}
        detail="Tenant-scoped dossier"
      />
      <PolicyRecord
        label="Operating mode"
        value={displace ? "Displace" : "Propagate"}
        detail={
          displace ? "Artifact and people workflow" : "Artifact governance only"
        }
      />
      <PolicyRecord
        label="Result visibility"
        value={
          data.organization.individualResultsVisible
            ? "Individual detail permitted"
            : "Aggregate by default"
        }
        detail="Organization policy"
      />
      <PolicyRecord
        label="Audit vocabulary"
        value="Observable actions only"
        detail="Assigned, assessed, remediated, rechecked"
      />
    </Surface>
  );
}

export function SectionHeading({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <header className="border-border border-b px-4 py-4 sm:px-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-1 max-w-[70ch] text-sm leading-6">
        {detail}
      </p>
    </header>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold opacity-65">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function ActorRecord({
  role,
  name,
  date,
}: {
  role: string;
  name: string;
  date: string | null;
}) {
  return (
    <div className="px-5 py-4 sm:px-7">
      <dt className="data-label">{role}</dt>
      <dd className="mt-1 text-sm font-semibold">{name}</dd>
      <dd className="text-muted-foreground mt-1 text-xs">{formatDate(date)}</dd>
    </div>
  );
}

function RuleRecord({
  term,
  version,
  effectiveDate,
  rule,
  muted = false,
}: {
  term: string;
  version: string;
  effectiveDate: string;
  rule: string;
  muted?: boolean;
}) {
  return (
    <div className="grid gap-3 px-5 py-5 sm:grid-cols-[4rem_10rem_minmax(0,1fr)] sm:items-baseline sm:px-6">
      <dt className={muted ? "text-muted-foreground" : "text-primary"}>
        <span className="font-mono text-xs font-bold">{term}</span>
      </dt>
      <dd className="text-muted-foreground font-mono text-xs tabular-nums">
        {version} · {effectiveDate}
      </dd>
      <dd
        className={
          muted
            ? "text-muted-foreground text-base leading-7"
            : "text-lg leading-7 font-semibold text-pretty"
        }
      >
        {rule}
      </dd>
    </div>
  );
}

function PolicyRecord({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <dl className="bg-card px-4 py-4 sm:px-5">
      <dt className="data-label">{label}</dt>
      <dd className="mt-1.5 text-sm font-semibold">{value}</dd>
      <dd className="text-muted-foreground mt-1 text-xs leading-5">{detail}</dd>
    </dl>
  );
}

function Disposition({ impact }: { impact: ArtifactImpact }) {
  const label =
    impact.rewriteRequired === "yes"
      ? "Rewrite required"
      : impact.rewriteRequired === "candidate"
        ? "Classification review"
        : "No rewrite flagged";
  const tone =
    impact.rewriteRequired === "yes"
      ? "text-destructive"
      : impact.rewriteRequired === "candidate"
        ? "text-warning"
        : "text-success";
  return (
    <div>
      <strong className={`block text-xs ${tone}`}>{label}</strong>
      <span className="text-muted-foreground mt-1 block text-xs tabular-nums">
        Path confidence {Math.round(impact.confidence * 100)}%
      </span>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
