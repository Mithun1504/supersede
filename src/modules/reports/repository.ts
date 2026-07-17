import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import {
  auditEvents,
  changeEvents,
  changeEventVersions,
  sources,
  reportBundles,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export type ObservableMetrics = {
  affectedArtifacts: number;
  artifactsVerified: number;
  peopleAssigned: number;
  peopleAssessed: number;
  peopleRemediated: number;
  rechecksDue: number;
  rechecksClean: number;
};

export async function listReportableChanges(actor: CurrentActor) {
  authorize(actor, "result.read_aggregate");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    (transaction) =>
      transaction
        .select({
          id: changeEventVersions.id,
          sourceTitle: sources.title,
          summary: changeEventVersions.diffSummary,
          createdAt: changeEventVersions.createdAt,
        })
        .from(changeEventVersions)
        .innerJoin(
          changeEvents,
          eq(changeEvents.id, changeEventVersions.changeEventId),
        )
        .innerJoin(sources, eq(sources.id, changeEvents.sourceId))
        .where(eq(changeEventVersions.status, "validated"))
        .orderBy(desc(changeEventVersions.createdAt)),
  );
}

export async function listReportBundles(actor: CurrentActor) {
  authorize(actor, "result.read_aggregate");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    (transaction) =>
      transaction
        .select({
          id: reportBundles.id,
          changeEventVersionId: reportBundles.changeEventVersionId,
          status: reportBundles.status,
          cutoff: reportBundles.queryCutoffAt,
          sha256: reportBundles.bundleSha256,
          requestedAt: reportBundles.requestedAt,
          completedAt: reportBundles.completedAt,
          errorSummary: reportBundles.errorSummary,
        })
        .from(reportBundles)
        .orderBy(desc(reportBundles.requestedAt))
        .limit(100),
  );
}

export async function getChangeAuditReport(
  actor: CurrentActor,
  changeEventVersionId: string,
  cutoff: Date,
) {
  authorize(actor, "result.read_aggregate");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [change] = await transaction
        .select({
          id: changeEventVersions.id,
          sourceTitle: sources.title,
          summary: changeEventVersions.diffSummary,
          oldRule: changeEventVersions.oldRule,
          newRule: changeEventVersions.newRule,
        })
        .from(changeEventVersions)
        .innerJoin(
          changeEvents,
          eq(changeEvents.id, changeEventVersions.changeEventId),
        )
        .innerJoin(sources, eq(sources.id, changeEvents.sourceId))
        .where(eq(changeEventVersions.id, changeEventVersionId))
        .limit(1);
      if (!change) return null;

      const metricRows = await transaction.execute<ObservableMetrics>(sql`
        -- Metrics are observable event/fact counts only. Latest assessments exclude
        -- superseded revisions and ambiguity retirements flagged for metric exclusion.
        -- Open/delivery events deliberately do not count as assessed or remediated.
        with
          current_assessment as (
            select pa.*
            from probe_assessment pa
            where pa.assessed_at <= ${cutoff}
              and not exists (
                select 1 from probe_assessment successor
                where successor.supersedes_probe_assessment_id = pa.id
                  and successor.assessed_at <= ${cutoff}
              )
          ),
          valid_probe as (
            select distinct pba.id, pba.person_id, pba.assignment_kind, ca.label
            from probe_assignment pba
            join probe_response pr on pr.probe_assignment_id = pba.id and pr.submitted_at <= ${cutoff}
            join current_assessment ca on ca.probe_response_id = pr.id
            join divergence_case_version dcv on dcv.id = pba.case_version_id
            left join case_retirement cr on cr.case_version_id = dcv.id
            where pba.change_event_version_id = ${changeEventVersionId}
              and pba.created_at <= ${cutoff}
              and dcv.record_status = 'approved'
              and coalesce(cr.excludes_historical_metrics, false) = false
          )
        select
          (select count(distinct ar.artifact_id)::int
           from artifact_remediation ar
           join propagation_run run on run.id = ar.propagation_run_id
           where run.change_event_version_id = ${changeEventVersionId} and ar.created_at <= ${cutoff}) as "affectedArtifacts",
          (select count(distinct ar.artifact_id)::int
           from artifact_remediation ar
           join propagation_run run on run.id = ar.propagation_run_id
           where run.change_event_version_id = ${changeEventVersionId} and ar.status = 'verified' and ar.created_at <= ${cutoff}) as "artifactsVerified",
          (select count(distinct pba.person_id)::int from probe_assignment pba
           where pba.change_event_version_id = ${changeEventVersionId} and pba.created_at <= ${cutoff}) as "peopleAssigned",
          (select count(distinct person_id)::int from valid_probe) as "peopleAssessed",
          (select count(distinct ra.person_id)::int
           from remediation_assignment ra
           join probe_assessment pa on pa.id = ra.trigger_probe_assessment_id
           join probe_response pr on pr.id = pa.probe_response_id
           join probe_assignment pba on pba.id = pr.probe_assignment_id
           where pba.change_event_version_id = ${changeEventVersionId} and ra.status = 'passed' and ra.completed_at <= ${cutoff}) as "peopleRemediated",
          (select count(*)::int
           from recheck_assignment rca
           join remediation_assignment ra on ra.id = rca.remediation_assignment_id
           join probe_assessment pa on pa.id = ra.trigger_probe_assessment_id
           join probe_response pr on pr.id = pa.probe_response_id
           join probe_assignment pba on pba.id = pr.probe_assignment_id
           where pba.change_event_version_id = ${changeEventVersionId} and rca.due_at <= ${cutoff}) as "rechecksDue",
          (select count(*)::int
           from recheck_assignment rca
           join probe_assignment pba on pba.recheck_assignment_id = rca.id
           join valid_probe vp on vp.id = pba.id
           where rca.due_at <= ${cutoff} and rca.status = 'completed' and vp.label = 'new') as "rechecksClean"
      `);
      const metrics = metricRows.rows[0] ?? {
        affectedArtifacts: 0,
        artifactsVerified: 0,
        peopleAssigned: 0,
        peopleAssessed: 0,
        peopleRemediated: 0,
        rechecksDue: 0,
        rechecksClean: 0,
      };
      const timeline = actor.permissions.includes("audit.read")
        ? await transaction
            .select({
              id: auditEvents.id,
              eventType: auditEvents.eventType,
              actorType: auditEvents.actorType,
              objectType: auditEvents.objectType,
              objectId: auditEvents.objectId,
              occurredAt: auditEvents.occurredAt,
            })
            .from(auditEvents)
            .where(eq(auditEvents.objectId, changeEventVersionId))
            .orderBy(desc(auditEvents.occurredAt))
            .limit(100)
        : [];
      return { change, cutoff, metrics, timeline };
    },
  );
}
