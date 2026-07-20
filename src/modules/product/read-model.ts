import "server-only";

import { cache } from "react";
import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  resolveActorContext,
  resolvePublicWalkthroughContext,
  withTenantContext,
} from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { getOptionalAuthContext } from "@/modules/identity/auth";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type CoreRow = {
  organizationId: string;
  organizationName: string;
  configuration: "propagate" | "displace";
  individualResultsVisible: boolean;
  changeEventId: string;
  changeEventVersionId: string;
  versionLabel: string;
  oldRule: string;
  newRule: string;
  affectedPopulation: string;
  enteredAt: Date | string;
  validatedAt: Date | string | null;
  lockedAt: Date | string | null;
  enteredBy: string;
  validatedBy: string | null;
  sourceId: string;
  sourceTitle: string;
  oldSourceVersionId: string;
  newSourceVersionId: string;
  oldSourceVersionLabel: string;
  newSourceVersionLabel: string;
  oldEffectiveDate: string;
  newEffectiveDate: string;
  oldSourceSummary: string;
  newSourceSummary: string;
};

type ClaimRow = {
  claimId: string;
  claimVersionId: string;
  canonicalKey: string;
  versionLabel: string;
  text: string;
  evidenceQuote: string;
  evidencePage: string | null;
  evidenceSection: string | null;
  confidence: string;
  loadBearingScore: string;
  loadBearingRationale: string;
  reviewStatus:
    "suggested" | "needs_review" | "reviewed" | "rejected" | "retired";
  artifactId: string;
  artifactVersionId: string;
  artifactTitle: string;
  artifactVersionLabel: string;
  artifactKind: string;
  reviewedBy: string | null;
  hasReviewedSourceDependency: boolean;
};

type ImpactRow = {
  impactId: string;
  objectType: string;
  objectId: string;
  impactKind: "load_bearing" | "peripheral" | "person_exposure";
  confidence: string;
  rationale: string;
  rewriteRequired: "yes" | "no" | "candidate";
  pathDepth: number;
  artifactId: string | null;
  artifactTitle: string | null;
  artifactKind: string | null;
  artifactVersionLabel: string | null;
  artifactOwner: string | null;
  artifactOwnerMembershipId: string | null;
  correctionVersionId: string | null;
  correctionVersionLabel: string | null;
  correctionLockedAt: Date | string | null;
  correctionPublished: boolean;
};

type MemberRow = { id: string; displayName: string };

type ExposureRow = {
  exposureId: string;
  artifactVersionId: string;
  professionalRoleId: string;
  roleName: string;
  confidence: string;
  rationale: string;
  peopleCount: number;
};

type EdgeRow = {
  edgeId: string;
  edgeVersionId: string;
  evidenceQuote: string;
  confidence: string;
  reviewStatus: ClaimRow["reviewStatus"];
};

type CaseRow = {
  caseId: string;
  caseVersionId: string;
  versionLabel: string;
  scenario: string;
  oldAnswer: string;
  newAnswer: string;
  rationale: string;
  oldCitation: Record<string, unknown>;
  newCitation: Record<string, unknown>;
  status: "draft" | "approved" | "retired";
  ambiguityNote: string | null;
  author: string;
  approver: string | null;
  approvedAt: Date | string | null;
  lockedAt: Date | string | null;
};

type ProbeRow = {
  assignmentId: string;
  personId: string;
  personName: string;
  professionalRole: string;
  caseVersionId: string;
  scenario: string;
  oldAnswer: string;
  newAnswer: string;
  caseRationale: string;
  dueAt: Date | string | null;
  assignedAt: Date | string;
  deliveryStatus: string | null;
  responseId: string | null;
  answeredWith: "old" | "new" | "other" | null;
  responseText: string | null;
  gradingConfidence: string | null;
  reviewRequired: boolean | null;
  remediationAssignmentId: string | null;
  remediationStatus: "assigned" | "in_progress" | "passed" | "failed" | null;
  remediationArtifactText: string | null;
  remediationFeedback: string | null;
  recheckScheduled: number;
  recheckCompleted: number;
};

type TimelineRow = {
  id: string;
  occurredAt: Date | string;
  actor: string | null;
  eventType: string;
  objectType: string;
  objectId: string;
  objectVersionId: string | null;
};

type ApprovalRow = {
  id: string;
  createdAt: Date | string;
  actor: string;
  role: string;
  action: string;
  objectType: string;
  objectId: string;
  objectVersionId: string;
};

type ReportRow = {
  id: string;
  sha256: string;
  storageObjectKey: string;
  cutoffAt: Date | string;
  lockedAt: Date | string;
};

type ChangeListRow = {
  changeEventId: string;
  changeEventVersionId: string;
  enteredByMembershipId: string;
  versionLabel: string;
  sourceTitle: string;
  oldRule: string;
  newRule: string;
  enteredBy: string;
  validatedBy: string | null;
  enteredAt: Date | string;
  validatedAt: Date | string | null;
  lockedAt: Date | string | null;
  impactCount: number;
};

export type ProductWorkspace = {
  organization: {
    id: string;
    name: string;
    configuration: "propagate" | "displace";
    individualResultsVisible: boolean;
  };
  viewer: {
    membershipId: string;
    displayName: string;
    authenticated: boolean;
    organizationReady: boolean;
    roles: string[];
  };
  change: {
    id: string;
    versionId: string;
    reference: string;
    versionLabel: string;
    oldRule: string;
    newRule: string;
    affectedPopulation: string;
    enteredAt: string;
    validatedAt: string | null;
    lockedAt: string | null;
    enteredBy: string;
    validatedBy: string | null;
    sourceId: string;
    sourceTitle: string;
    oldSourceVersionId: string;
    newSourceVersionId: string;
    oldSourceVersionLabel: string;
    newSourceVersionLabel: string;
    oldEffectiveDate: string;
    newEffectiveDate: string;
    oldSourceSummary: string;
    newSourceSummary: string;
  };
  claims: Array<{
    id: string;
    versionId: string;
    key: string;
    versionLabel: string;
    text: string;
    evidenceQuote: string;
    evidenceLocation: string;
    confidence: number;
    loadBearingScore: number;
    rationale: string;
    reviewStatus: ClaimRow["reviewStatus"];
    artifactId: string;
    artifactVersionId: string;
    artifactTitle: string;
    artifactVersionLabel: string;
    artifactKind: string;
    reviewedBy: string | null;
    hasReviewedSourceDependency: boolean;
  }>;
  impacts: Array<{
    id: string;
    objectType: string;
    objectId: string;
    kind: ImpactRow["impactKind"];
    confidence: number;
    rationale: string;
    rewriteRequired: ImpactRow["rewriteRequired"];
    pathDepth: number;
    artifactId: string | null;
    artifactTitle: string | null;
    artifactKind: string | null;
    artifactVersionLabel: string | null;
    artifactOwner: string | null;
    artifactOwnerMembershipId: string | null;
    correctionVersionId: string | null;
    correctionVersionLabel: string | null;
    correctionLockedAt: string | null;
    correctionPublished: boolean;
  }>;
  members: Array<{ id: string; displayName: string }>;
  exposures: Array<{
    id: string;
    artifactVersionId: string;
    roleId: string;
    roleName: string;
    confidence: number;
    rationale: string;
    peopleCount: number;
  }>;
  edges: Array<{
    id: string;
    versionId: string;
    evidenceQuote: string;
    confidence: number;
    reviewStatus: ClaimRow["reviewStatus"];
  }>;
  cases: Array<{
    id: string;
    versionId: string;
    versionLabel: string;
    scenario: string;
    oldAnswer: string;
    newAnswer: string;
    rationale: string;
    oldCitation: Record<string, unknown>;
    newCitation: Record<string, unknown>;
    status: CaseRow["status"];
    ambiguityNote: string | null;
    author: string;
    approver: string | null;
    approvedAt: string | null;
    lockedAt: string | null;
  }>;
  probes: Array<{
    assignmentId: string;
    personId: string;
    personName: string;
    professionalRole: string;
    caseVersionId: string;
    scenario: string;
    oldAnswer: string;
    newAnswer: string;
    caseRationale: string;
    dueAt: string | null;
    assignedAt: string;
    deliveryStatus: string | null;
    responseId: string | null;
    answeredWith: ProbeRow["answeredWith"];
    responseText: string | null;
    gradingConfidence: number | null;
    reviewRequired: boolean | null;
    remediationAssignmentId: string | null;
    remediationStatus: ProbeRow["remediationStatus"];
    remediationArtifactText: string | null;
    remediationFeedback: string | null;
    recheckScheduled: number;
    recheckCompleted: number;
  }>;
  timeline: Array<{
    id: string;
    occurredAt: string;
    actor: string;
    eventType: string;
    objectType: string;
    objectId: string;
    objectVersionId: string | null;
  }>;
  approvals: Array<{
    id: string;
    createdAt: string;
    actor: string;
    role: string;
    action: string;
    objectType: string;
    objectId: string;
    objectVersionId: string;
  }>;
  reports: Array<{
    id: string;
    sha256: string;
    storageObjectKey: string;
    cutoffAt: string;
    lockedAt: string;
  }>;
  changes: Array<{
    id: string;
    versionId: string;
    enteredByMembershipId: string;
    reference: string;
    versionLabel: string;
    sourceTitle: string;
    oldRule: string;
    newRule: string;
    enteredBy: string;
    validatedBy: string | null;
    enteredAt: string;
    validatedAt: string | null;
    lockedAt: string | null;
    impactCount: number;
  }>;
};

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function reference(id: string) {
  return `CE-${id.slice(0, 8).toUpperCase()}`;
}

async function loadWorkspace(
  transaction: Transaction,
  organizationId: string,
): Promise<Omit<ProductWorkspace, "viewer">> {
  const core = await transaction.execute<CoreRow>(sql`
    select
      o.id::text as "organizationId",
      o.name as "organizationName",
      o.product_configuration as configuration,
      o.individual_results_visible as "individualResultsVisible",
      ce.id::text as "changeEventId",
      cev.id::text as "changeEventVersionId",
      cev.version_label as "versionLabel",
      cev.old_rule as "oldRule",
      cev.new_rule as "newRule",
      cev.affected_population as "affectedPopulation",
      ce.created_at as "enteredAt",
      ce.validated_at as "validatedAt",
      cev.locked_at as "lockedAt",
      entered.display_name as "enteredBy",
      validated.display_name as "validatedBy",
      s.id::text as "sourceId",
      s.title as "sourceTitle",
      old_sv.id::text as "oldSourceVersionId",
      new_sv.id::text as "newSourceVersionId",
      old_sv.version_label as "oldSourceVersionLabel",
      new_sv.version_label as "newSourceVersionLabel",
      old_sv.effective_date::text as "oldEffectiveDate",
      new_sv.effective_date::text as "newEffectiveDate",
      old_sv.summary as "oldSourceSummary",
      new_sv.summary as "newSourceSummary"
    from organization o
    join change_event ce on ce.organization_id = o.id
    join change_event_version cev
      on cev.organization_id = o.id and cev.change_event_id = ce.id
    join source s on s.organization_id = o.id and s.id = ce.source_id
    join source_version old_sv on old_sv.id = cev.old_source_version_id
    join source_version new_sv on new_sv.id = cev.new_source_version_id
    join membership entered on entered.id = ce.entered_by_membership_id
    left join membership validated on validated.id = ce.validated_by_membership_id
    where o.id = ${organizationId}
    order by ce.validated_at desc nulls last, cev.created_at desc
    limit 1
  `);
  const active = core.rows[0];
  if (!active) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "This workspace has no ChangeEvent data.",
      status: 404,
    });
  }

  const claimResult = await transaction.execute<ClaimRow>(sql`
    select
      c.id::text as "claimId",
      cv.id::text as "claimVersionId",
      c.canonical_key as "canonicalKey",
      cv.version_label as "versionLabel",
      cv.text,
      cv.evidence_quote as "evidenceQuote",
      cv.evidence_page as "evidencePage",
      cv.evidence_section as "evidenceSection",
      cv.confidence::text,
      cv.load_bearing_score::text as "loadBearingScore",
      cv.load_bearing_rationale as "loadBearingRationale",
      cv.review_status as "reviewStatus",
      a.id::text as "artifactId",
      av.id::text as "artifactVersionId",
      a.title as "artifactTitle",
      av.version_label as "artifactVersionLabel",
      a.kind::text as "artifactKind",
      reviewer.display_name as "reviewedBy",
      exists (
        select 1
        from dependency_edge edge
        join dependency_edge_version edge_version
          on edge_version.organization_id = edge.organization_id
         and edge_version.edge_id = edge.id
        where edge.organization_id = c.organization_id
          and edge.kind = 'supports'
          and edge.from_object_type = 'claim_version'
          and edge.from_object_id = cv.id
          and edge.to_object_type = 'source_version'
          and edge.to_object_id = ${active.oldSourceVersionId}
          and edge_version.review_status = 'reviewed'
          and edge_version.locked_at is not null
      ) as "hasReviewedSourceDependency"
    from claim c
    join claim_version cv on cv.claim_id = c.id and cv.organization_id = c.organization_id
    join artifact_version av on av.id = c.artifact_version_id
    join artifact a on a.id = av.artifact_id
    left join membership reviewer on reviewer.id = cv.reviewed_by_membership_id
    where c.organization_id = ${organizationId}
    order by
      case cv.review_status when 'needs_review' then 0 when 'suggested' then 1 else 2 end,
      cv.confidence desc,
      cv.created_at desc
  `);

  const impactResult = await transaction.execute<ImpactRow>(sql`
    select
      ci.id::text as "impactId",
      ci.impacted_object_type as "objectType",
      ci.impacted_object_id::text as "objectId",
      ci.impact_kind as "impactKind",
      ci.confidence::text,
      ci.rationale,
      ci.rewrite_required as "rewriteRequired",
      ci.path_depth as "pathDepth",
      a.id::text as "artifactId",
      a.title as "artifactTitle",
      a.kind::text as "artifactKind",
      av.version_label as "artifactVersionLabel",
      owner.display_name as "artifactOwner",
      owner.id::text as "artifactOwnerMembershipId",
      correction.id::text as "correctionVersionId",
      correction.version_label as "correctionVersionLabel",
      correction.locked_at as "correctionLockedAt",
      coalesce(correction.published, false) as "correctionPublished"
    from change_impact ci
    left join artifact_version av
      on ci.impacted_object_type = 'artifact_version'
     and av.id = ci.impacted_object_id
    left join artifact a on a.id = av.artifact_id
    left join membership owner on owner.id = a.owner_membership_id
    left join lateral (
      select candidate.id, candidate.version_label, candidate.locked_at,
        exists (
          select 1 from audit_event publication
          where publication.organization_id = candidate.organization_id
            and publication.object_version_id = candidate.id
            and publication.event_type = 'artifact.version_published'
        ) as published
      from artifact_version candidate
      where candidate.organization_id = ci.organization_id
        and candidate.artifact_id = a.id
        and candidate.id <> av.id
      order by candidate.created_at desc
      limit 1
    ) correction on true
    where ci.organization_id = ${organizationId}
      and ci.change_event_version_id = ${active.changeEventVersionId}
    order by ci.confidence desc, ci.path_depth asc
  `);

  const exposureResult = await transaction.execute<ExposureRow>(sql`
    select
      rae.id::text as "exposureId",
      rae.artifact_version_id::text as "artifactVersionId",
      pr.id::text as "professionalRoleId",
      pr.display_name as "roleName",
      rae.confidence::text,
      rae.rationale,
      count(p.id)::int as "peopleCount"
    from role_artifact_exposure rae
    join professional_role pr on pr.id = rae.professional_role_id
    left join person p
      on p.organization_id = rae.organization_id
     and p.professional_role_id = pr.id
    where rae.organization_id = ${organizationId}
      and rae.artifact_version_id in (
        select impacted_object_id from change_impact
        where organization_id = ${organizationId}
          and change_event_version_id = ${active.changeEventVersionId}
          and impacted_object_type = 'artifact_version'
      )
    group by rae.id, pr.id
    order by rae.confidence desc, pr.display_name asc
  `);

  const edgeResult = await transaction.execute<EdgeRow>(sql`
    select edge.id::text as "edgeId", version.id::text as "edgeVersionId",
      version.evidence_quote as "evidenceQuote", version.confidence::text,
      version.review_status as "reviewStatus"
    from dependency_edge edge
    join dependency_edge_version version
      on version.organization_id = edge.organization_id and version.edge_id = edge.id
    where edge.organization_id = ${organizationId}
      and edge.to_object_type = 'source_version'
      and edge.to_object_id = ${active.oldSourceVersionId}
    order by version.created_at desc
  `);

  const caseResult = await transaction.execute<CaseRow>(sql`
    select
      dc.id::text as "caseId",
      dcv.id::text as "caseVersionId",
      dcv.version_label as "versionLabel",
      dcv.scenario,
      dcv.old_answer as "oldAnswer",
      dcv.new_answer as "newAnswer",
      dcv.rationale,
      dcv.old_citation as "oldCitation",
      dcv.new_citation as "newCitation",
      dcv.status,
      dcv.ambiguity_note as "ambiguityNote",
      author.display_name as author,
      approver.display_name as approver,
      dcv.approved_at as "approvedAt",
      dcv.locked_at as "lockedAt"
    from divergence_case dc
    join divergence_case_version dcv on dcv.case_id = dc.id
    join membership author on author.id = dcv.authored_by_membership_id
    left join membership approver on approver.id = dcv.approved_by_membership_id
    where dc.organization_id = ${organizationId}
      and dcv.change_event_version_id = ${active.changeEventVersionId}
    order by dcv.created_at desc
  `);

  const probeResult = await transaction.execute<ProbeRow>(sql`
    select
      pa.id::text as "assignmentId",
      p.id::text as "personId",
      p.display_name as "personName",
      pr.display_name as "professionalRole",
      dcv.id::text as "caseVersionId",
      dcv.scenario,
      dcv.old_answer as "oldAnswer",
      dcv.new_answer as "newAnswer",
      dcv.rationale as "caseRationale",
      pa.due_at as "dueAt",
      pa.created_at as "assignedAt",
      delivery.status::text as "deliveryStatus",
      response.id::text as "responseId",
      response.answered_with as "answeredWith",
      response.response_text as "responseText",
      response.grading_confidence::text as "gradingConfidence",
      response.review_required as "reviewRequired",
      remediation.id::text as "remediationAssignmentId",
      remediation.status as "remediationStatus",
      av.body_text as "remediationArtifactText",
      attempt.feedback as "remediationFeedback",
      (select count(*)::int from recheck_assignment r
        where r.organization_id = pa.organization_id
          and r.person_id = pa.person_id
          and r.change_event_version_id = pa.change_event_version_id
          and r.status in ('scheduled', 'assigned', 'blocked_case_required')) as "recheckScheduled",
      (select count(*)::int from recheck_assignment r
        where r.organization_id = pa.organization_id
          and r.person_id = pa.person_id
          and r.change_event_version_id = pa.change_event_version_id
          and r.status = 'completed') as "recheckCompleted"
    from probe_assignment pa
    join person p on p.id = pa.person_id
    join professional_role pr on pr.id = p.professional_role_id
    join divergence_case_version dcv on dcv.id = pa.case_version_id
    left join lateral (
      select pde.status from probe_delivery_event pde
      where pde.assignment_id = pa.id
      order by pde.occurred_at desc limit 1
    ) delivery on true
    left join probe_response response on response.assignment_id = pa.id
    left join remediation_assignment remediation on remediation.probe_response_id = response.id
    left join artifact_version av on av.id = remediation.artifact_version_id
    left join lateral (
      select rat.feedback from remediation_attempt rat
      where rat.remediation_assignment_id = remediation.id
      order by rat.created_at desc limit 1
    ) attempt on true
    where pa.organization_id = ${organizationId}
      and pa.change_event_version_id = ${active.changeEventVersionId}
    order by pa.created_at desc
  `);

  const timelineResult = await transaction.execute<TimelineRow>(sql`
    select
      ae.id::text,
      ae.occurred_at as "occurredAt",
      m.display_name as actor,
      ae.event_type as "eventType",
      ae.object_type as "objectType",
      ae.object_id::text as "objectId",
      ae.object_version_id::text as "objectVersionId"
    from audit_event ae
    left join membership m on m.id = ae.actor_membership_id
    where ae.organization_id = ${organizationId}
      and (
        (ae.object_type = 'change_event' and ae.object_id = ${active.changeEventId})
        or ae.object_version_id = ${active.changeEventVersionId}
        or ae.object_id in (
          select id from probe_assignment
          where organization_id = ${organizationId}
            and change_event_version_id = ${active.changeEventVersionId}
        )
      )
    order by ae.occurred_at desc, ae.id desc
    limit 100
  `);

  const approvalResult = await transaction.execute<ApprovalRow>(sql`
    select
      ar.id::text,
      ar.created_at as "createdAt",
      m.display_name as actor,
      ar.actor_role_code as role,
      ar.action,
      ar.object_type as "objectType",
      ar.object_id::text as "objectId",
      ar.object_version_id::text as "objectVersionId"
    from approval_record ar
    join membership m on m.id = ar.actor_membership_id
    where ar.organization_id = ${organizationId}
      and (
        (ar.object_type = 'change_event' and ar.object_id = ${active.changeEventId})
        or ar.object_version_id = ${active.changeEventVersionId}
        or ar.object_version_id in (
          select id from divergence_case_version
          where organization_id = ${organizationId}
            and change_event_version_id = ${active.changeEventVersionId}
        )
      )
    order by ar.created_at desc, ar.id desc
  `);

  const reportResult = await transaction.execute<ReportRow>(sql`
    select id::text, sha256, storage_object_key as "storageObjectKey",
      cutoff_at as "cutoffAt", locked_at as "lockedAt"
    from report_bundle
    where organization_id = ${organizationId}
      and change_event_version_id = ${active.changeEventVersionId}
    order by created_at desc
  `);

  const changeListResult = await transaction.execute<ChangeListRow>(sql`
    select
      ce.id::text as "changeEventId",
      cev.id::text as "changeEventVersionId",
      ce.entered_by_membership_id::text as "enteredByMembershipId",
      cev.version_label as "versionLabel",
      s.title as "sourceTitle",
      cev.old_rule as "oldRule",
      cev.new_rule as "newRule",
      entered.display_name as "enteredBy",
      validated.display_name as "validatedBy",
      ce.created_at as "enteredAt",
      ce.validated_at as "validatedAt",
      cev.locked_at as "lockedAt",
      (select count(*)::int from change_impact ci
        where ci.organization_id = ce.organization_id
          and ci.change_event_version_id = cev.id) as "impactCount"
    from change_event ce
    join change_event_version cev on cev.change_event_id = ce.id
    join source s on s.id = ce.source_id
    join membership entered on entered.id = ce.entered_by_membership_id
    left join membership validated on validated.id = ce.validated_by_membership_id
    where ce.organization_id = ${organizationId}
    order by ce.created_at desc, cev.created_at desc
  `);

  const memberResult = await transaction.execute<MemberRow>(sql`
    select id::text, display_name as "displayName"
    from membership
    where organization_id = ${organizationId}
      and status = 'active'
    order by display_name
  `);

  return {
    organization: {
      id: active.organizationId,
      name: active.organizationName,
      configuration: active.configuration,
      individualResultsVisible: active.individualResultsVisible,
    },
    change: {
      id: active.changeEventId,
      versionId: active.changeEventVersionId,
      reference: reference(active.changeEventId),
      versionLabel: active.versionLabel,
      oldRule: active.oldRule,
      newRule: active.newRule,
      affectedPopulation: active.affectedPopulation,
      enteredAt: toIso(active.enteredAt)!,
      validatedAt: toIso(active.validatedAt),
      lockedAt: toIso(active.lockedAt),
      enteredBy: active.enteredBy,
      validatedBy: active.validatedBy,
      sourceId: active.sourceId,
      sourceTitle: active.sourceTitle,
      oldSourceVersionId: active.oldSourceVersionId,
      newSourceVersionId: active.newSourceVersionId,
      oldSourceVersionLabel: active.oldSourceVersionLabel,
      newSourceVersionLabel: active.newSourceVersionLabel,
      oldEffectiveDate: active.oldEffectiveDate,
      newEffectiveDate: active.newEffectiveDate,
      oldSourceSummary: active.oldSourceSummary,
      newSourceSummary: active.newSourceSummary,
    },
    claims: claimResult.rows.map((row) => ({
      id: row.claimId,
      versionId: row.claimVersionId,
      key: row.canonicalKey,
      versionLabel: row.versionLabel,
      text: row.text,
      evidenceQuote: row.evidenceQuote,
      evidenceLocation:
        row.evidencePage ?? row.evidenceSection ?? row.artifactVersionLabel,
      confidence: Number(row.confidence),
      loadBearingScore: Number(row.loadBearingScore),
      rationale: row.loadBearingRationale,
      reviewStatus: row.reviewStatus,
      artifactId: row.artifactId,
      artifactVersionId: row.artifactVersionId,
      artifactTitle: row.artifactTitle,
      artifactVersionLabel: row.artifactVersionLabel,
      artifactKind: row.artifactKind,
      reviewedBy: row.reviewedBy,
      hasReviewedSourceDependency: row.hasReviewedSourceDependency,
    })),
    impacts: impactResult.rows.map((row) => ({
      id: row.impactId,
      objectType: row.objectType,
      objectId: row.objectId,
      kind: row.impactKind,
      confidence: Number(row.confidence),
      rationale: row.rationale,
      rewriteRequired: row.rewriteRequired,
      pathDepth: row.pathDepth,
      artifactId: row.artifactId,
      artifactTitle: row.artifactTitle,
      artifactKind: row.artifactKind,
      artifactVersionLabel: row.artifactVersionLabel,
      artifactOwner: row.artifactOwner,
      artifactOwnerMembershipId: row.artifactOwnerMembershipId,
      correctionVersionId: row.correctionVersionId,
      correctionVersionLabel: row.correctionVersionLabel,
      correctionLockedAt: toIso(row.correctionLockedAt),
      correctionPublished: row.correctionPublished,
    })),
    exposures: exposureResult.rows.map((row) => ({
      id: row.exposureId,
      artifactVersionId: row.artifactVersionId,
      roleId: row.professionalRoleId,
      roleName: row.roleName,
      confidence: Number(row.confidence),
      rationale: row.rationale,
      peopleCount: row.peopleCount,
    })),
    edges: edgeResult.rows.map((row) => ({
      id: row.edgeId,
      versionId: row.edgeVersionId,
      evidenceQuote: row.evidenceQuote,
      confidence: Number(row.confidence),
      reviewStatus: row.reviewStatus,
    })),
    members: memberResult.rows,
    cases: caseResult.rows.map((row) => ({
      id: row.caseId,
      versionId: row.caseVersionId,
      versionLabel: row.versionLabel,
      scenario: row.scenario,
      oldAnswer: row.oldAnswer,
      newAnswer: row.newAnswer,
      rationale: row.rationale,
      oldCitation: row.oldCitation,
      newCitation: row.newCitation,
      status: row.status,
      ambiguityNote: row.ambiguityNote,
      author: row.author,
      approver: row.approver,
      approvedAt: toIso(row.approvedAt),
      lockedAt: toIso(row.lockedAt),
    })),
    probes: probeResult.rows.map((row) => ({
      assignmentId: row.assignmentId,
      personId: row.personId,
      personName: row.personName,
      professionalRole: row.professionalRole,
      caseVersionId: row.caseVersionId,
      scenario: row.scenario,
      oldAnswer: row.oldAnswer,
      newAnswer: row.newAnswer,
      caseRationale: row.caseRationale,
      dueAt: toIso(row.dueAt),
      assignedAt: toIso(row.assignedAt)!,
      deliveryStatus: row.deliveryStatus,
      responseId: row.responseId,
      answeredWith: row.answeredWith,
      responseText: row.responseText,
      gradingConfidence:
        row.gradingConfidence === null ? null : Number(row.gradingConfidence),
      reviewRequired: row.reviewRequired,
      remediationAssignmentId: row.remediationAssignmentId,
      remediationStatus: row.remediationStatus,
      remediationArtifactText: row.remediationArtifactText,
      remediationFeedback: row.remediationFeedback,
      recheckScheduled: row.recheckScheduled,
      recheckCompleted: row.recheckCompleted,
    })),
    timeline: timelineResult.rows.map((row) => ({
      id: row.id,
      occurredAt: toIso(row.occurredAt)!,
      actor: row.actor ?? "System",
      eventType: row.eventType,
      objectType: row.objectType,
      objectId: row.objectId,
      objectVersionId: row.objectVersionId,
    })),
    approvals: approvalResult.rows.map((row) => ({
      id: row.id,
      createdAt: toIso(row.createdAt)!,
      actor: row.actor,
      role: row.role,
      action: row.action,
      objectType: row.objectType,
      objectId: row.objectId,
      objectVersionId: row.objectVersionId,
    })),
    reports: reportResult.rows.map((row) => ({
      id: row.id,
      sha256: row.sha256,
      storageObjectKey: row.storageObjectKey,
      cutoffAt: toIso(row.cutoffAt)!,
      lockedAt: toIso(row.lockedAt)!,
    })),
    changes: changeListResult.rows.map((row) => ({
      id: row.changeEventId,
      versionId: row.changeEventVersionId,
      enteredByMembershipId: row.enteredByMembershipId,
      reference: reference(row.changeEventId),
      versionLabel: row.versionLabel,
      sourceTitle: row.sourceTitle,
      oldRule: row.oldRule,
      newRule: row.newRule,
      enteredBy: row.enteredBy,
      validatedBy: row.validatedBy,
      enteredAt: toIso(row.enteredAt)!,
      validatedAt: toIso(row.validatedAt),
      lockedAt: toIso(row.lockedAt),
      impactCount: row.impactCount,
    })),
  };
}

export const getProductWorkspace = cache(
  async (): Promise<ProductWorkspace> => {
    const auth = await getOptionalAuthContext();
    const { organizationReady, tenant } = await resolveWorkspaceTenant(auth);

    const workspace = await withTenantContext(tenant, (transaction) =>
      loadWorkspace(transaction, tenant.organizationId),
    );

    return {
      ...workspace,
      viewer: {
        membershipId: tenant.actorMembershipId,
        displayName: auth?.displayName ?? "Public walkthrough",
        authenticated: Boolean(auth),
        organizationReady,
        roles: await withTenantContext(tenant, async (transaction) => {
          const result = await transaction.execute<{ roleCode: string }>(sql`
          select role_code as "roleCode" from membership_role
          where organization_id = ${tenant.organizationId}
            and membership_id = ${tenant.actorMembershipId}
          order by role_code
        `);
          return result.rows.map((row) => row.roleCode);
        }),
      },
    };
  },
);

async function resolveWorkspaceTenant(
  auth: Awaited<ReturnType<typeof getOptionalAuthContext>>,
) {
  if (!auth) {
    return {
      organizationReady: false,
      tenant: await resolvePublicWalkthroughContext(),
    };
  }

  try {
    return {
      organizationReady: true,
      tenant: await resolveActorContext({
        workosOrganizationId: auth.workosOrganizationId,
        workosUserId: auth.workosUserId,
        email: auth.email,
        displayName: auth.displayName,
      }),
    };
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "FORBIDDEN") {
      throw error;
    }

    return {
      organizationReady: false,
      tenant: await resolvePublicWalkthroughContext(),
    };
  }
}
