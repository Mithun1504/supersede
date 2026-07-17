import "server-only";

import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import {
  dataDispositionRuns,
  legalHolds,
  reportBundles,
  retentionPolicies,
  storageObjects,
  workflowRuns,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { getAuditStorageClient } from "@/lib/storage/clients";
import { recordMembershipEvent } from "@/modules/audit/service";
import { getAuthenticationAssurance } from "@/modules/identity/auth";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

async function requireStrongAssurance() {
  const assurance = await getAuthenticationAssurance();
  if (assurance.authenticationAgeSeconds > 300 || !assurance.mfaVerified)
    throw new AppError({
      code: "FORBIDDEN",
      message: "Recent MFA authentication is required for retention controls.",
      status: 403,
    });
}

export async function saveReportRetentionPolicy(
  actor: CurrentActor,
  input: {
    retentionDays: number;
    retentionMode: "governance" | "compliance";
    dispositionAction: "delete" | "retain";
  },
) {
  authorize(actor, "retention.manage");
  await requireStrongAssurance();
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`retention:${actor.organization.id}`}, 0))`,
      );
      const [current] = await transaction
        .select()
        .from(retentionPolicies)
        .where(
          and(
            eq(retentionPolicies.dataClass, "report_bundle"),
            eq(retentionPolicies.status, "approved"),
          ),
        )
        .orderBy(desc(retentionPolicies.versionNumber))
        .limit(1);
      if (current)
        await transaction
          .update(retentionPolicies)
          .set({ status: "superseded" })
          .where(eq(retentionPolicies.id, current.id));
      const [policy] = await transaction
        .insert(retentionPolicies)
        .values({
          organizationId: actor.organization.id,
          dataClass: "report_bundle",
          versionNumber: (current?.versionNumber ?? 0) + 1,
          retentionDays: input.retentionDays,
          retentionMode: input.retentionMode,
          dispositionAction: input.dispositionAction,
          status: "approved",
          effectiveFrom: new Date(),
          supersedesRetentionPolicyId: current?.id ?? null,
          createdByMembershipId: actor.membership.id,
        })
        .returning({ id: retentionPolicies.id });
      if (!policy) throw new Error("Retention policy insert returned no row.");
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "retention.policy_approved",
        objectType: "retention_policy",
        objectId: policy.id,
        objectVersionId: policy.id,
        payload: input,
      });
    },
  );
}

export async function createLegalHold(
  actor: CurrentActor,
  input: {
    scopeType: "organization" | "report_bundle";
    scopeId: string;
    reason: string;
    reference: string;
  },
) {
  authorize(actor, "retention.manage");
  await requireStrongAssurance();
  if (
    input.scopeType === "organization" &&
    input.scopeId !== actor.organization.id
  )
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "An organization hold must target the active organization.",
      status: 422,
    });
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`retention:${actor.organization.id}`}, 0))`,
      );
      if (input.scopeType === "report_bundle") {
        const [report] = await transaction
          .select({ id: reportBundles.id })
          .from(reportBundles)
          .where(eq(reportBundles.id, input.scopeId))
          .limit(1);
        if (!report)
          throw new AppError({
            code: "NOT_FOUND",
            message: "The report bundle does not exist.",
            status: 404,
          });
      }
      const [hold] = await transaction
        .insert(legalHolds)
        .values({
          organizationId: actor.organization.id,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          reason: input.reason,
          reference: input.reference,
          startsAt: new Date(),
          createdByMembershipId: actor.membership.id,
        })
        .returning({ id: legalHolds.id });
      if (!hold) throw new Error("Legal hold insert returned no row.");
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "legal_hold.created",
        objectType: "legal_hold",
        objectId: hold.id,
        objectVersionId: hold.id,
        payload: {
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          reference: input.reference,
        },
      });
    },
  );
}

export async function releaseLegalHold(
  actor: CurrentActor,
  legalHoldId: string,
) {
  authorize(actor, "retention.manage");
  await requireStrongAssurance();
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`retention:${actor.organization.id}`}, 0))`,
      );
      const [hold] = await transaction
        .update(legalHolds)
        .set({
          releasedAt: new Date(),
          releasedByMembershipId: actor.membership.id,
        })
        .where(
          and(eq(legalHolds.id, legalHoldId), isNull(legalHolds.releasedAt)),
        )
        .returning({ id: legalHolds.id });
      if (!hold)
        throw new AppError({
          code: "CONFLICT",
          message: "The legal hold is already released or unavailable.",
          status: 409,
        });
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "legal_hold.released",
        objectType: "legal_hold",
        objectId: hold.id,
        objectVersionId: hold.id,
      });
    },
  );
}

export async function runReportDisposition(
  actor: CurrentActor,
  retentionPolicyId: string,
  execute: boolean,
) {
  authorize(actor, "retention.manage");
  await requireStrongAssurance();
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`retention:${actor.organization.id}`}, 0))`,
      );
      const [policy] = await transaction
        .select()
        .from(retentionPolicies)
        .where(
          and(
            eq(retentionPolicies.id, retentionPolicyId),
            eq(retentionPolicies.dataClass, "report_bundle"),
            eq(retentionPolicies.status, "approved"),
          ),
        )
        .limit(1);
      if (!policy)
        throw new AppError({
          code: "NOT_FOUND",
          message: "The active report retention policy was not found.",
          status: 404,
        });
      const cutoff = new Date(Date.now() - policy.retentionDays * 86_400_000);
      const reports = await transaction
        .select({
          id: reportBundles.id,
          storageObjectId: storageObjects.id,
          bucket: storageObjects.bucketAlias,
          key: storageObjects.objectKey,
        })
        .from(reportBundles)
        .innerJoin(
          storageObjects,
          eq(storageObjects.id, reportBundles.storageObjectId),
        )
        .where(
          and(
            eq(reportBundles.status, "completed"),
            lte(reportBundles.completedAt, cutoff),
            lte(storageObjects.retentionUntil, new Date()),
          ),
        );
      const activeHolds = await transaction
        .select({
          scopeType: legalHolds.scopeType,
          scopeId: legalHolds.scopeId,
        })
        .from(legalHolds)
        .where(
          and(
            isNull(legalHolds.releasedAt),
            or(
              and(
                eq(legalHolds.scopeType, "organization"),
                eq(legalHolds.scopeId, actor.organization.id),
              ),
              eq(legalHolds.scopeType, "report_bundle"),
            ),
          ),
        );
      const organizationHeld = activeHolds.some(
        (hold) => hold.scopeType === "organization",
      );
      const heldIds = new Set(
        activeHolds.map((hold) => hold.scopeId).filter(Boolean),
      );
      const disposable = reports.filter(
        (report) => !organizationHeld && !heldIds.has(report.id),
      );
      const [workflow] = await transaction
        .insert(workflowRuns)
        .values({
          organizationId: actor.organization.id,
          workflowName: execute
            ? "report_disposition_v1"
            : "report_disposition_dry_run_v1",
          subjectType: "retention_policy",
          subjectId: policy.id,
          status: "running",
          progressTotal: reports.length,
          idempotencyKey: `${execute ? "execute" : "dry"}:${policy.id}:${new Date().toISOString()}`,
          startedAt: new Date(),
        })
        .returning({ id: workflowRuns.id });
      if (!workflow)
        throw new Error("Disposition workflow insert returned no row.");
      const [run] = await transaction
        .insert(dataDispositionRuns)
        .values({
          organizationId: actor.organization.id,
          retentionPolicyId: policy.id,
          workflowRunId: workflow.id,
          cutoffAt: cutoff,
          status: "running",
          candidateCount: reports.length,
          heldCount: reports.length - disposable.length,
          startedAt: new Date(),
        })
        .returning({ id: dataDispositionRuns.id });
      if (!run) throw new Error("Disposition run insert returned no row.");
      let disposed = 0;
      if (execute && policy.dispositionAction === "delete") {
        for (const report of disposable) {
          await getAuditStorageClient().send(
            new DeleteObjectCommand({ Bucket: report.bucket, Key: report.key }),
          );
          await transaction
            .update(reportBundles)
            .set({
              status: "expired",
              expiresAt: new Date(),
              storageObjectId: null,
            })
            .where(eq(reportBundles.id, report.id));
          await transaction
            .delete(storageObjects)
            .where(eq(storageObjects.id, report.storageObjectId));
          disposed += 1;
        }
      }
      await transaction
        .update(dataDispositionRuns)
        .set({
          status: "completed",
          disposedCount: disposed,
          completedAt: new Date(),
        })
        .where(eq(dataDispositionRuns.id, run.id));
      await transaction
        .update(workflowRuns)
        .set({
          status: "completed",
          progressCurrent: reports.length,
          completedAt: new Date(),
        })
        .where(eq(workflowRuns.id, workflow.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: execute
          ? "retention.disposition_executed"
          : "retention.disposition_dry_run",
        objectType: "data_disposition_run",
        objectId: run.id,
        objectVersionId: policy.id,
        payload: {
          candidateCount: reports.length,
          heldCount: reports.length - disposable.length,
          disposedCount: disposed,
          cutoffAt: cutoff.toISOString(),
        },
      });
      return {
        candidates: reports.length,
        held: reports.length - disposable.length,
        disposed,
      };
    },
  );
}
