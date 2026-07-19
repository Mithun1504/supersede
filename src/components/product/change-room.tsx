import Link from "next/link";

import {
  BlockerQueue,
  type Blocker,
  DossierHeader,
  ImpactTable,
  NextDecision,
  PolicyStrip,
  RuleRevision,
  SectionHeading,
  type ArtifactImpact,
  type WorkflowStep,
  WorkflowRow,
} from "@/components/product/control-room-ledgers";
import { Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { Button } from "@/components/ui/button";
import { getProductWorkspace, type ProductWorkspace } from "@/modules/product";

type Impact = ProductWorkspace["impacts"][number];

export async function ChangeRoom() {
  const data = await getProductWorkspace();
  const artifacts = data.impacts
    .filter(isArtifactImpact)
    .toSorted(compareImpact);
  const reviewedClaims = data.claims.filter(
    (claim) => claim.reviewStatus === "reviewed",
  ).length;
  const unreviewedClaims = data.claims.length - reviewedClaims;
  const candidateImpacts = data.impacts.filter(
    (impact) => impact.rewriteRequired === "candidate",
  ).length;
  const lowConfidenceImpacts = data.impacts.filter(
    (impact) => impact.confidence < 0.6,
  ).length;
  const unassignedImpacts = artifacts.filter(
    (impact) => !impact.artifactOwner,
  ).length;
  const openImpactFindings = data.impacts.filter(
    (impact) =>
      impact.rewriteRequired === "candidate" ||
      impact.confidence < 0.6 ||
      (isArtifactImpact(impact) && !impact.artifactOwner),
  ).length;
  const activeCases = data.cases.filter((item) => item.status !== "retired");
  const pendingCases = activeCases.filter(
    (item) => item.status !== "approved" || !item.lockedAt,
  ).length;
  const unansweredProbes = data.probes.filter(
    (probe) => !probe.responseId,
  ).length;
  const assessmentReviews = data.probes.filter(
    (probe) => probe.reviewRequired,
  ).length;
  const remediationPending = data.probes.filter(
    (probe) =>
      probe.answeredWith === "old" && probe.remediationStatus !== "passed",
  ).length;
  const rechecksPending = data.probes.reduce(
    (total, probe) =>
      total + Math.max(0, probe.recheckScheduled - probe.recheckCompleted),
    0,
  );
  const blockers = buildBlockers({
    data,
    unreviewedClaims,
    candidateImpacts,
    lowConfidenceImpacts,
    unassignedImpacts,
    pendingCases,
    unansweredProbes,
    assessmentReviews,
    remediationPending,
    rechecksPending,
  });
  const nextDecision = blockers[0];
  const workflow = buildWorkflow({
    data,
    reviewedClaims,
    openImpactFindings,
    activeCases: activeCases.length,
    pendingCases,
    unansweredProbes,
    assessmentReviews,
    remediationPending,
    rechecksPending,
    blockers: blockers.length,
  });

  return (
    <AuthenticatedProductShell
      active="overview"
      title="Control room"
      description="One governed change from evidence intake through audit closure."
      action={
        <Button asChild>
          <Link href={nextDecision?.href ?? "/app/audit"}>
            {nextDecision
              ? `Inspect step ${nextDecision.step}`
              : "Review audit trail"}
          </Link>
        </Button>
      }
    >
      <DossierHeader data={data} blockers={blockers.length} />

      <RuleRevision data={data} />

      <Surface>
        <SectionHeading
          title="Closure ledger"
          detail="The same order as the governed workflow. Each row links to the evidence behind its state."
        />
        <ol aria-label="Governed workflow closure state">
          {workflow.map((item) => (
            <WorkflowRow key={item.step} item={item} />
          ))}
        </ol>
      </Surface>

      <Surface className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)]">
        <NextDecision blocker={nextDecision} />
        <BlockerQueue blockers={blockers} />
      </Surface>

      <Surface>
        <SectionHeading
          title="Impacted obligations"
          detail="Downstream artifacts, accountable owners, and potential role exposure for this change."
        />
        <ImpactTable artifacts={artifacts} exposures={data.exposures} />
      </Surface>

      <PolicyStrip data={data} />
    </AuthenticatedProductShell>
  );
}

function buildBlockers(input: {
  data: ProductWorkspace;
  unreviewedClaims: number;
  candidateImpacts: number;
  lowConfidenceImpacts: number;
  unassignedImpacts: number;
  pendingCases: number;
  unansweredProbes: number;
  assessmentReviews: number;
  remediationPending: number;
  rechecksPending: number;
}): Blocker[] {
  const blockers: Blocker[] = [];
  if (input.unreviewedClaims > 0) {
    blockers.push({
      step: "01",
      title: "Verify extracted claims",
      detail: `${input.unreviewedClaims} claim ${input.unreviewedClaims === 1 ? "version needs" : "versions need"} human review.`,
      href: "/app/review",
    });
  }
  if (!input.data.change.validatedAt || !input.data.change.lockedAt) {
    blockers.push({
      step: "02",
      title: "Validate and lock the source change",
      detail: input.data.change.validatedAt
        ? "Second-person validation is recorded; the change version is not locked."
        : "The source change is awaiting second-person validation.",
      href: "/app/changes",
    });
  }
  if (input.data.impacts.length === 0) {
    blockers.push({
      step: "03",
      title: "Establish downstream paths",
      detail:
        "No dependency path is recorded for this validated change version.",
      href: "/app/graph",
    });
  }
  const impactIssues = [
    countPhrase(
      input.candidateImpacts,
      "candidate classification",
      "candidate classifications",
    ),
    countPhrase(
      input.lowConfidenceImpacts,
      "low-confidence path",
      "low-confidence paths",
    ),
    countPhrase(
      input.unassignedImpacts,
      "unassigned owner",
      "unassigned owners",
    ),
  ].filter(Boolean);
  const impactIssueCount =
    input.candidateImpacts +
    input.lowConfidenceImpacts +
    input.unassignedImpacts;
  if (impactIssues.length > 0) {
    blockers.push({
      step: "04",
      title: "Triage the open impact findings",
      detail: `${joinList(impactIssues)} ${impactIssueCount === 1 ? "remains" : "remain"} in the impact review.`,
      href: "/app/blast-radius",
    });
  }
  if (input.data.organization.configuration === "displace") {
    if (
      input.data.cases.filter((item) => item.status !== "retired").length === 0
    ) {
      blockers.push({
        step: "05",
        title: "Create an active divergence case",
        detail: "No active case is available for the changed rule.",
        href: "/app/cases",
      });
    } else if (input.pendingCases > 0) {
      blockers.push({
        step: "05",
        title: "Approve and lock decision cases",
        detail: `${input.pendingCases} active ${input.pendingCases === 1 ? "case is" : "cases are"} not approval-ready.`,
        href: "/app/cases",
      });
    }
    const outcomeIssues = [
      countPhrase(
        input.unansweredProbes,
        "unassessed assignment",
        "unassessed assignments",
      ),
      countPhrase(
        input.assessmentReviews,
        "response needing review",
        "responses needing review",
      ),
      countPhrase(
        input.remediationPending,
        "old-rule response awaiting remediation",
        "old-rule responses awaiting remediation",
      ),
      countPhrase(
        input.rechecksPending,
        "pending different-case recheck",
        "pending different-case rechecks",
      ),
    ].filter(Boolean);
    if (outcomeIssues.length > 0) {
      blockers.push({
        step: "06",
        title: "Close assessment and remediation work",
        detail: `${joinList(outcomeIssues)} remain open.`,
        href: "/app/probes",
      });
    }
  }
  if (input.data.reports.length === 0) {
    blockers.push({
      step: "07",
      title: "Generate a checksummed audit bundle",
      detail: "No report bundle is recorded for this change version.",
      href: "/app/audit",
    });
  }
  return blockers;
}

function buildWorkflow(input: {
  data: ProductWorkspace;
  reviewedClaims: number;
  openImpactFindings: number;
  activeCases: number;
  pendingCases: number;
  unansweredProbes: number;
  assessmentReviews: number;
  remediationPending: number;
  rechecksPending: number;
  blockers: number;
}): WorkflowStep[] {
  const displace = input.data.organization.configuration === "displace";
  const outcomeIssues =
    input.unansweredProbes +
    input.assessmentReviews +
    input.remediationPending +
    input.rechecksPending;
  const artifactImpacts = input.data.impacts.filter(isArtifactImpact).length;

  return [
    {
      step: "01",
      title: "Evidence intake",
      evidence: `${input.reviewedClaims} of ${input.data.claims.length} ${input.data.claims.length === 1 ? "claim version" : "claim versions"} reviewed`,
      state:
        input.reviewedClaims === input.data.claims.length &&
        input.reviewedClaims > 0
          ? "complete"
          : "action",
      stateLabel:
        input.reviewedClaims === input.data.claims.length &&
        input.reviewedClaims > 0
          ? "Reviewed"
          : "Needs review",
      href: "/app/review",
    },
    {
      step: "02",
      title: "Source change",
      evidence: input.data.change.validatedBy
        ? `Validated by ${input.data.change.validatedBy}`
        : "Second reviewer not recorded",
      state:
        input.data.change.validatedAt && input.data.change.lockedAt
          ? "complete"
          : "action",
      stateLabel:
        input.data.change.validatedAt && input.data.change.lockedAt
          ? "Locked"
          : "Open",
      href: "/app/changes",
    },
    {
      step: "03",
      title: "Dependency map",
      evidence: `${input.data.impacts.length} downstream impact ${input.data.impacts.length === 1 ? "path" : "paths"} recorded`,
      state: input.data.impacts.length > 0 ? "complete" : "action",
      stateLabel: input.data.impacts.length > 0 ? "Mapped" : "No paths",
      href: "/app/graph",
    },
    {
      step: "04",
      title: "Impact review",
      evidence: `${artifactImpacts} ${artifactImpacts === 1 ? "artifact" : "artifacts"} triaged; ${input.openImpactFindings} open ${input.openImpactFindings === 1 ? "finding" : "findings"}`,
      state: input.openImpactFindings === 0 ? "complete" : "action",
      stateLabel:
        input.openImpactFindings === 0 ? "Triaged" : "Needs decisions",
      href: "/app/blast-radius",
    },
    {
      step: "05",
      title: "Decision cases",
      evidence: displace
        ? `${input.activeCases - input.pendingCases} of ${input.activeCases} active ${input.activeCases === 1 ? "case" : "cases"} approved and locked`
        : "Not used in Propagate mode",
      state: !displace
        ? "not-applicable"
        : input.activeCases > 0 && input.pendingCases === 0
          ? "complete"
          : "action",
      stateLabel: !displace
        ? "Not in mode"
        : input.activeCases > 0 && input.pendingCases === 0
          ? "Approved"
          : "Open",
      href: "/app/cases",
    },
    {
      step: "06",
      title: "Remediation",
      evidence: displace
        ? `${input.data.probes.length} ${input.data.probes.length === 1 ? "assignment" : "assignments"}; ${outcomeIssues} open work ${outcomeIssues === 1 ? "item" : "items"}`
        : "Not used in Propagate mode",
      state: !displace
        ? "not-applicable"
        : input.data.probes.length > 0 && outcomeIssues === 0
          ? "complete"
          : "action",
      stateLabel: !displace
        ? "Not in mode"
        : input.data.probes.length === 0
          ? "Not started"
          : outcomeIssues === 0
            ? "Complete"
            : "In progress",
      href: "/app/probes",
    },
    {
      step: "07",
      title: "Audit trail",
      evidence: `${input.data.reports.length} checksummed report ${input.data.reports.length === 1 ? "bundle" : "bundles"} recorded`,
      state:
        input.data.reports.length === 0
          ? "pending"
          : input.blockers === 0
            ? "complete"
            : "prepared",
      stateLabel:
        input.data.reports.length === 0
          ? "Not generated"
          : input.blockers === 0
            ? "Ready"
            : "Prepared",
      href: "/app/audit",
    },
  ];
}

function isArtifactImpact(impact: Impact): impact is ArtifactImpact {
  return Boolean(
    impact.artifactId &&
    impact.artifactTitle &&
    impact.artifactKind &&
    impact.artifactVersionLabel,
  );
}

function compareImpact(a: ArtifactImpact, b: ArtifactImpact) {
  const priority = { yes: 0, candidate: 1, no: 2 } as const;
  return (
    priority[a.rewriteRequired] - priority[b.rewriteRequired] ||
    a.confidence - b.confidence
  );
}

function countPhrase(count: number, singular: string, plural: string) {
  return count > 0 ? `${count} ${count === 1 ? singular : plural}` : "";
}

function joinList(items: string[]) {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
