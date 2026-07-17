import "server-only";

import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { AuditExportInput } from "@/modules/audit/export-bundle";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const TEMPLATE_VERSION = "1.0";

type ChangeRow = {
  organizationName: string;
  changeEventId: string;
  changeEventVersionId: string;
  versionLabel: string;
};

type StageRow = {
  assigned: number;
  assessed: number;
  remediated: number;
  rechecked: number;
};

type EventRow = {
  occurredAt: Date | string;
  actor: string;
  action: string;
  objectType: string;
  objectVersion: string;
};

type ApprovalRow = {
  id: string;
  organizationId: string;
  actorMembershipId: string;
  actorRoleCode: string;
  objectType: string;
  objectId: string;
  objectVersionId: string;
  action: AuditExportInput["approvals"][number]["action"];
  metadata: Record<string, unknown>;
  createdAt: Date | string;
};

function toIsoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Audit evidence contains an invalid timestamp.");
  }
  return date.toISOString();
}

function releaseSha(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    "local-dev"
  ).slice(0, 64);
}

function changeReference(change: ChangeRow): string {
  return `CE-${change.changeEventId.slice(0, 8)}-${change.versionLabel}`
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 128);
}

async function getChange(
  transaction: Transaction,
  organizationId: string,
  changeEventId: string,
  changeEventVersionId: string,
): Promise<ChangeRow | undefined> {
  const [change] = await transaction
    .execute<ChangeRow>(
      sql`
    select
      o.name as "organizationName",
      ce.id::text as "changeEventId",
      cev.id::text as "changeEventVersionId",
      cev.version_label as "versionLabel"
    from change_event ce
    join change_event_version cev
      on cev.change_event_id = ce.id
     and cev.organization_id = ce.organization_id
    join organization o on o.id = ce.organization_id
    where ce.organization_id = ${organizationId}
      and ce.id = ${changeEventId}
      and cev.id = ${changeEventVersionId}
    limit 1
  `,
    )
    .then((result) => result.rows);
  return change;
}

async function getStages(
  transaction: Transaction,
  organizationId: string,
  changeEventVersionId: string,
): Promise<StageRow> {
  const [row] = await transaction
    .execute<StageRow>(
      sql`
    select
      (select count(*)::int from probe_assignment pa
        where pa.organization_id = ${organizationId}
          and pa.change_event_version_id = ${changeEventVersionId}) as assigned,
      (select count(*)::int from probe_response pr
        join probe_assignment pa on pa.id = pr.assignment_id
        where pr.organization_id = ${organizationId}
          and pa.organization_id = ${organizationId}
          and pa.change_event_version_id = ${changeEventVersionId}) as assessed,
      (select count(*)::int from remediation_assignment ra
        join probe_response pr on pr.id = ra.probe_response_id
        join probe_assignment pa on pa.id = pr.assignment_id
        where ra.organization_id = ${organizationId}
          and pr.organization_id = ${organizationId}
          and pa.organization_id = ${organizationId}
          and pa.change_event_version_id = ${changeEventVersionId}
          and ra.status = 'passed') as remediated,
      (select count(*)::int from recheck_assignment rca
        where rca.organization_id = ${organizationId}
          and rca.change_event_version_id = ${changeEventVersionId}
          and rca.status = 'completed') as rechecked
  `,
    )
    .then((result) => result.rows);
  return row ?? { assigned: 0, assessed: 0, remediated: 0, rechecked: 0 };
}

async function getEvents(
  transaction: Transaction,
  organizationId: string,
  changeEventId: string,
  changeEventVersionId: string,
  cutoffAt: Date,
): Promise<EventRow[]> {
  return transaction
    .execute<EventRow>(
      sql`
    with
      scoped_case_versions as (
        select id from divergence_case_version
        where organization_id = ${organizationId}
          and change_event_version_id = ${changeEventVersionId}
      ),
      scoped_probe_assignments as (
        select id from probe_assignment
        where organization_id = ${organizationId}
          and change_event_version_id = ${changeEventVersionId}
      ),
      scoped_probe_responses as (
        select pr.id from probe_response pr
        join scoped_probe_assignments pa on pa.id = pr.assignment_id
        where pr.organization_id = ${organizationId}
      ),
      scoped_remediations as (
        select ra.id from remediation_assignment ra
        join scoped_probe_responses pr on pr.id = ra.probe_response_id
        where ra.organization_id = ${organizationId}
      ),
      scoped_rechecks as (
        select id from recheck_assignment
        where organization_id = ${organizationId}
          and change_event_version_id = ${changeEventVersionId}
      ),
      scoped_artifact_versions as (
        select impacted_object_id as id from change_impact
        where organization_id = ${organizationId}
          and change_event_version_id = ${changeEventVersionId}
          and impacted_object_type = 'artifact_version'
      )
    select
      ae.occurred_at as "occurredAt",
      coalesce(m.display_name, 'System') as actor,
      ae.event_type as action,
      ae.object_type as "objectType",
      coalesce(ae.object_version_id::text, ae.object_id::text) as "objectVersion"
    from audit_event ae
    left join membership m
      on m.id = ae.actor_membership_id
     and m.organization_id = ae.organization_id
    where ae.organization_id = ${organizationId}
      and ae.occurred_at <= ${cutoffAt}
      and (
        (
          ae.object_type = 'change_event'
          and ae.object_id = ${changeEventId}
          and (ae.object_version_id is null or ae.object_version_id = ${changeEventVersionId})
        )
        or (ae.object_type = 'divergence_case' and ae.object_version_id in (select id from scoped_case_versions))
        or (ae.object_type = 'probe_assignment' and (
          ae.object_id in (select id from scoped_probe_assignments)
          or ae.object_version_id in (select id from scoped_case_versions)
        ))
        or (ae.object_type = 'probe_response' and ae.object_id in (select id from scoped_probe_responses))
        or (ae.object_type = 'remediation_assignment' and ae.object_id in (select id from scoped_remediations))
        or (ae.object_type = 'recheck_assignment' and ae.object_id in (select id from scoped_rechecks))
        or (ae.object_type in ('artifact', 'artifact_version') and ae.object_version_id in (select id from scoped_artifact_versions))
      )
    order by ae.occurred_at asc, ae.id asc
  `,
    )
    .then((result) => result.rows);
}

async function getApprovals(
  transaction: Transaction,
  organizationId: string,
  changeEventId: string,
  changeEventVersionId: string,
  cutoffAt: Date,
): Promise<ApprovalRow[]> {
  return transaction
    .execute<ApprovalRow>(
      sql`
    with
      scoped_case_versions as (
        select id from divergence_case_version
        where organization_id = ${organizationId}
          and change_event_version_id = ${changeEventVersionId}
      ),
      scoped_artifact_versions as (
        select impacted_object_id as id from change_impact
        where organization_id = ${organizationId}
          and change_event_version_id = ${changeEventVersionId}
          and impacted_object_type = 'artifact_version'
      )
    select
      id::text,
      organization_id::text as "organizationId",
      actor_membership_id::text as "actorMembershipId",
      actor_role_code as "actorRoleCode",
      object_type as "objectType",
      object_id::text as "objectId",
      object_version_id::text as "objectVersionId",
      action,
      metadata,
      created_at as "createdAt"
    from approval_record
    where organization_id = ${organizationId}
      and created_at <= ${cutoffAt}
      and (
        (
          object_type = 'change_event'
          and object_id = ${changeEventId}
          and object_version_id = ${changeEventVersionId}
        )
        or object_version_id in (select id from scoped_case_versions)
        or object_version_id in (select id from scoped_artifact_versions)
      )
    order by created_at asc, id asc
  `,
    )
    .then((result) => result.rows);
}

export async function buildAuditReportInput(
  transaction: Transaction,
  input: {
    organizationId: string;
    changeEventId: string;
    changeEventVersionId: string;
    cutoffAt: Date;
    generatedAt: Date;
    retentionMode: "standard" | "object_lock";
  },
): Promise<AuditExportInput | undefined> {
  const change = await getChange(
    transaction,
    input.organizationId,
    input.changeEventId,
    input.changeEventVersionId,
  );
  if (!change) return undefined;

  const stages = await getStages(
    transaction,
    input.organizationId,
    input.changeEventVersionId,
  );
  const events = await getEvents(
    transaction,
    input.organizationId,
    input.changeEventId,
    input.changeEventVersionId,
    input.cutoffAt,
  );
  const approvals = await getApprovals(
    transaction,
    input.organizationId,
    input.changeEventId,
    input.changeEventVersionId,
    input.cutoffAt,
  );

  return {
    organizationId: input.organizationId,
    organizationName: change.organizationName,
    changeEventId: input.changeEventId,
    changeReference: changeReference(change),
    changeVersionId: input.changeEventVersionId,
    cutoffAt: input.cutoffAt.toISOString(),
    generatedAt: input.generatedAt.toISOString(),
    releaseSha: releaseSha(),
    templateVersion: TEMPLATE_VERSION,
    retentionMode: input.retentionMode,
    stages,
    events: events.map((event) => ({
      ...event,
      occurredAt: toIsoTimestamp(event.occurredAt),
    })),
    approvals: approvals.map((approval) => ({
      id: approval.id,
      organizationId: approval.organizationId,
      actorMembershipId: approval.actorMembershipId,
      actorRoleCode: approval.actorRoleCode,
      objectType: approval.objectType,
      objectId: approval.objectId,
      objectVersionId: approval.objectVersionId,
      action: approval.action,
      metadata: approval.metadata,
      createdAt: toIsoTimestamp(approval.createdAt),
    })),
  };
}
