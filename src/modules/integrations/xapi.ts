import "server-only";

import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  integrationConnections,
  integrationJobItems,
  integrationJobs,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

type AssessmentExportRow = {
  assessment_id: string;
  email: string;
  display_name: string | null;
  label: "old" | "new" | "other";
  assessed_at: Date;
  assignment_id: string;
  case_version_id: string;
  change_event_version_id: string;
  assignment_kind: string;
};

export async function createXapiExport(actor: CurrentActor) {
  authorize(actor, "integration.manage");
  if (actor.organization.productConfiguration !== "displace")
    throw new AppError({
      code: "NOT_FOUND",
      message: "Learning exports are available only in Displace.",
      status: 404,
    });
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [connection] = await transaction
        .select({ id: integrationConnections.id })
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.type, "lms_xapi"),
            eq(integrationConnections.status, "active"),
          ),
        )
        .limit(1);
      if (!connection)
        throw new AppError({
          code: "CONFLICT",
          message: "Activate an xAPI connection before exporting.",
          status: 409,
        });
      const rows = (
        await transaction.execute<AssessmentExportRow>(sql`
          select a.id as assessment_id, p.email, p.display_name, a.label,
                 a.assessed_at, pa.id as assignment_id, pa.case_version_id,
                 pa.change_event_version_id, pa.assignment_kind
          from probe_assessment a
          join probe_response r on r.id = a.probe_response_id
          join probe_assignment pa on pa.id = r.probe_assignment_id
          join person p on p.id = pa.person_id
          where p.email is not null
            and not exists (
              select 1 from probe_assessment successor
              where successor.supersedes_probe_assessment_id = a.id
            )
          order by a.assessed_at, a.id
        `)
      ).rows;
      const statements = rows.map((row) => ({
        id: row.assessment_id,
        actor: {
          objectType: "Agent",
          name: row.display_name ?? undefined,
          mbox: `mailto:${row.email.toLowerCase()}`,
        },
        verb: {
          id: "http://adlnet.gov/expapi/verbs/answered",
          display: { "en-US": "answered" },
        },
        object: {
          id: `urn:supersede:probe-assignment:${row.assignment_id}`,
          objectType: "Activity",
          definition: {
            type: "https://supersede.app/xapi/activity/divergence-probe",
            name: { "en-US": "Governed change scenario" },
          },
        },
        result: {
          success: row.label === "new",
          completion: true,
          extensions: {
            "https://supersede.app/xapi/extensions/assessment-label": row.label,
            "https://supersede.app/xapi/extensions/assessment-revision":
              row.assessment_id,
            "https://supersede.app/xapi/extensions/case-version":
              row.case_version_id,
            "https://supersede.app/xapi/extensions/change-event-version":
              row.change_event_version_id,
            "https://supersede.app/xapi/extensions/assignment-kind":
              row.assignment_kind,
          },
        },
        timestamp: row.assessed_at.toISOString(),
        context: {
          platform: "Supersede",
          extensions: {
            "https://supersede.app/xapi/extensions/organization":
              actor.organization.id,
          },
        },
      }));
      const [job] = await transaction
        .insert(integrationJobs)
        .values({
          organizationId: actor.organization.id,
          integrationConnectionId: connection.id,
          jobType: "xapi_assessment_export_v1",
          direction: "export",
          status: "completed",
          requestedByMembershipId: actor.membership.id,
          totalCount: statements.length,
          succeededCount: statements.length,
          completedAt: new Date(),
        })
        .returning({ id: integrationJobs.id });
      if (!job) throw new Error("Export job insert returned no row.");
      if (statements.length)
        await transaction.insert(integrationJobItems).values(
          statements.map((statement, position) => ({
            organizationId: actor.organization.id,
            integrationJobId: job.id,
            position,
            externalKey: statement.id,
            status: "completed" as const,
            resultObjectType: "probe_assessment",
            resultObjectId: statement.id,
            payloadSha256: createHash("sha256")
              .update(JSON.stringify(statement))
              .digest("hex"),
          })),
        );
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "integration.xapi_exported",
        objectType: "integration_job",
        objectId: job.id,
        payload: { statementCount: statements.length },
      });
      return { jobId: job.id, statements };
    },
  );
}
