import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, lte } from "drizzle-orm";

import {
  changeEventVersions,
  reportBundles,
  retentionPolicies,
  workflowRuns,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { inngest } from "@/inngest/client";
import { getConfigurationStatus, getServerEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import { authorize, type CurrentActor } from "@/modules/identity/policy";
import type { z } from "zod";
import type { requestReportInput } from "@/modules/reports/contracts";
import { generateReportBundle } from "@/modules/reports/generation";

type RequestReportInput = z.infer<typeof requestReportInput>;

function releaseSha() {
  const env = getServerEnv();
  const value =
    env.APPLICATION_RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (value && /^[0-9a-f]{40}$/.test(value)) return value;
  if (env.NODE_ENV === "production")
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "APPLICATION_RELEASE_SHA is required for report provenance.",
      status: 503,
    });
  return "0".repeat(40);
}

export async function requestReport(
  actor: CurrentActor,
  input: RequestReportInput,
): Promise<string> {
  authorize(actor, "report.export");
  const reportId = randomUUID();
  const saved = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [existing] = await transaction
        .select({ id: reportBundles.id, status: reportBundles.status })
        .from(reportBundles)
        .where(eq(reportBundles.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) return { id: existing.id, shouldGenerate: false };
      const [change] = await transaction
        .select({
          id: changeEventVersions.id,
          status: changeEventVersions.status,
        })
        .from(changeEventVersions)
        .where(eq(changeEventVersions.id, input.changeEventVersionId))
        .limit(1);
      if (!change || change.status !== "validated")
        throw new AppError({
          code: "CONFLICT",
          message: "Reports require an exact validated ChangeEvent version.",
          status: 409,
        });
      const [retentionPolicy] = await transaction
        .select({ id: retentionPolicies.id })
        .from(retentionPolicies)
        .where(
          and(
            eq(retentionPolicies.dataClass, "report_bundle"),
            eq(retentionPolicies.status, "approved"),
            lte(retentionPolicies.effectiveFrom, new Date()),
          ),
        )
        .limit(1);
      if (!retentionPolicy)
        throw new AppError({
          code: "CONFLICT",
          message:
            "Configure an approved report retention policy before exporting evidence.",
          status: 409,
        });
      const [workflow] = await transaction
        .insert(workflowRuns)
        .values({
          organizationId: actor.organization.id,
          workflowName: "report_bundle_v1",
          subjectType: "report_bundle",
          subjectId: reportId,
          status: "queued",
          progressTotal: 1,
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: workflowRuns.id });
      if (!workflow)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The report workflow could not be created.",
          status: 500,
        });
      await transaction.insert(reportBundles).values({
        id: reportId,
        organizationId: actor.organization.id,
        changeEventVersionId: input.changeEventVersionId,
        requestedByMembershipId: actor.membership.id,
        queryCutoffAt: input.cutoff,
        includeIndividualResults: false,
        templateVersion: "change_evidence_v1",
        applicationReleaseSha: releaseSha(),
        workflowRunId: workflow.id,
        idempotencyKey: input.idempotencyKey,
      });
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "report.requested",
        objectType: "report_bundle",
        objectId: reportId,
        objectVersionId: reportId,
        payload: {
          changeEventVersionId: input.changeEventVersionId,
          queryCutoffAt: input.cutoff.toISOString(),
          includeIndividualResults: false,
        },
        publish: {
          eventName: "report/requested",
          payload: {
            organizationId: actor.organization.id,
            reportBundleId: reportId,
          },
        },
      });
      return { id: reportId, shouldGenerate: true };
    },
  );
  if (!saved.shouldGenerate) return saved.id;
  if (getConfigurationStatus().inngest) {
    try {
      await inngest.send({
        name: "report/requested",
        data: {
          organizationId: actor.organization.id,
          reportBundleId: saved.id,
        },
      });
      return saved.id;
    } catch {
      // Transactional outbox remains available; synchronous fallback preserves usability.
    }
  }
  await generateReportBundle(actor.organization.id, saved.id);
  return saved.id;
}
