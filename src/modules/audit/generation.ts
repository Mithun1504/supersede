import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db/client";
import { auditEvents, outboxEvents, reportBundles } from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { getConfigurationStatus, getServerEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { assertIdempotencyActor } from "@/lib/security/idempotency";
import { buildAuditExportBundle } from "@/modules/audit/export-bundle";
import { storeAuditExport } from "@/modules/audit/export-storage";
import { requireAuditor } from "@/modules/audit/approvals";
import { buildAuditReportInput } from "@/modules/audit/generation-evidence";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const uuidSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(255);
const retentionModeSchema = z.enum(["standard", "object_lock"]);
const optionalRetainUntilSchema = z.iso.datetime().optional().nullable();

type GenerationResponse = {
  reportBundleId: string;
  storageObjectKey: string;
  sha256: string;
  retentionMode: "standard" | "object_lock";
  worm: boolean;
  retainUntil?: string;
};

export type ReportGenerationRequest = {
  reportRequestId: string;
  status: "queued";
};

export async function queueAuditReportGeneration(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    changeEventId: string;
    changeEventVersionId: string;
    retentionMode?: "standard" | "object_lock";
    retainUntil?: string | null | undefined;
    cutoffAt?: string | undefined;
  },
): Promise<ReportGenerationRequest> {
  const parsed = {
    idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
    changeEventId: uuidSchema.parse(input.changeEventId),
    changeEventVersionId: uuidSchema.parse(input.changeEventVersionId),
    retentionMode: retentionModeSchema
      .optional()
      .default("standard")
      .parse(input.retentionMode),
    retainUntil: optionalRetainUntilSchema.parse(input.retainUntil),
    cutoffAt: input.cutoffAt
      ? z.iso.datetime().parse(input.cutoffAt)
      : undefined,
  };
  return withTenantContext(actor, async (transaction) => {
    await requireAuditor(transaction, actor);
    const payload = {
      actorMembershipId: actor.actorMembershipId,
      changeEventId: parsed.changeEventId,
      changeEventVersionId: parsed.changeEventVersionId,
      retentionMode: parsed.retentionMode,
      retainUntil: parsed.retainUntil,
      cutoffAt: parsed.cutoffAt,
    };
    const [created] = await transaction
      .insert(outboxEvents)
      .values({
        organizationId: actor.organizationId,
        idempotencyKey: parsed.idempotencyKey,
        eventName: "report.requested",
        aggregateType: "change_event_version",
        aggregateId: parsed.changeEventVersionId,
        payload,
      })
      .onConflictDoNothing({
        target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
      })
      .returning({ id: outboxEvents.id });
    if (created) return { reportRequestId: created.id, status: "queued" };

    const [existing] = await transaction
      .select({
        id: outboxEvents.id,
        eventName: outboxEvents.eventName,
        payload: outboxEvents.payload,
      })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, actor.organizationId),
          eq(outboxEvents.idempotencyKey, parsed.idempotencyKey),
        ),
      )
      .limit(1);
    if (!existing || existing.eventName !== "report.requested") {
      throw new AppError({
        code: "CONFLICT",
        message: "The idempotency key was already used for another operation.",
        status: 409,
      });
    }
    assertIdempotencyActor(existing.payload, actor.actorMembershipId);
    return { reportRequestId: existing.id, status: "queued" };
  });
}

function existingResponse(
  payload: Record<string, unknown>,
): GenerationResponse {
  return {
    reportBundleId: uuidSchema.parse(payload.reportBundleId),
    storageObjectKey: z.string().min(1).parse(payload.storageObjectKey),
    sha256: z.string().length(64).parse(payload.sha256),
    retentionMode: retentionModeSchema.parse(payload.retentionMode),
    worm: z.boolean().parse(payload.worm),
    ...(payload.retainUntil
      ? { retainUntil: z.iso.datetime().parse(payload.retainUntil) }
      : {}),
  };
}

async function reserveGeneration(
  transaction: Transaction,
  input: {
    organizationId: string;
    actorMembershipId: string;
    idempotencyKey: string;
    changeEventId: string;
    changeEventVersionId: string;
  },
) {
  const payload = {
    actorMembershipId: input.actorMembershipId,
    changeEventId: input.changeEventId,
    changeEventVersionId: input.changeEventVersionId,
  };
  const [event] = await transaction
    .insert(outboxEvents)
    .values({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      eventName: "report_bundle.generated",
      aggregateType: "report_bundle",
      aggregateId: input.changeEventVersionId,
      payload,
    })
    .onConflictDoNothing({
      target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
    })
    .returning({ id: outboxEvents.id, payload: outboxEvents.payload });
  if (event) return { duplicate: false, id: event.id, payload: event.payload };

  const [existing] = await transaction
    .select({
      id: outboxEvents.id,
      eventName: outboxEvents.eventName,
      payload: outboxEvents.payload,
    })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Idempotency reservation disappeared.");
  if (existing.eventName !== "report_bundle.generated") {
    throw new AppError({
      code: "CONFLICT",
      message: "The idempotency key was already used for another operation.",
      status: 409,
    });
  }
  return { duplicate: true, id: existing.id, payload: existing.payload };
}

export async function generateAuditReportBundle(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    changeEventId: string;
    changeEventVersionId: string;
    retentionMode?: "standard" | "object_lock";
    retainUntil?: string | null | undefined;
    cutoffAt?: string | undefined;
    now?: Date;
  },
): Promise<GenerationResponse> {
  const parsed = {
    idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
    changeEventId: uuidSchema.parse(input.changeEventId),
    changeEventVersionId: uuidSchema.parse(input.changeEventVersionId),
    retentionMode: retentionModeSchema
      .optional()
      .default("standard")
      .parse(input.retentionMode),
    retainUntil: optionalRetainUntilSchema.parse(input.retainUntil),
  };
  const generatedAt = input.now ?? new Date();
  const cutoffAt = input.cutoffAt ? new Date(input.cutoffAt) : generatedAt;
  if (Number.isNaN(cutoffAt.getTime()) || cutoffAt > generatedAt) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "cutoffAt must be a valid datetime no later than generation.",
      status: 422,
    });
  }
  const retainUntil = parsed.retainUntil ? new Date(parsed.retainUntil) : null;
  if (parsed.retentionMode === "object_lock" && !retainUntil) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Object Lock exports require retainUntil.",
      status: 422,
    });
  }
  if (retainUntil && retainUntil <= generatedAt) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Retention deadline must be in the future.",
      status: 422,
    });
  }
  if (
    parsed.retentionMode === "object_lock" &&
    !getConfigurationStatus().auditStorage
  ) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Object Lock audit storage is not configured.",
      status: 422,
    });
  }

  const prepared = await withTenantContext(actor, async (transaction) => {
    await requireAuditor(transaction, actor);
    const reservation = await reserveGeneration(transaction, {
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      idempotencyKey: parsed.idempotencyKey,
      changeEventId: parsed.changeEventId,
      changeEventVersionId: parsed.changeEventVersionId,
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      if (!("reportBundleId" in reservation.payload)) {
        throw new AppError({
          code: "CONFLICT",
          message: "This report generation is still being finalized.",
          status: 409,
        });
      }
      return {
        duplicate: true as const,
        response: existingResponse(reservation.payload),
      };
    }
    const reportInput = await buildAuditReportInput(transaction, {
      organizationId: actor.organizationId,
      changeEventId: parsed.changeEventId,
      changeEventVersionId: parsed.changeEventVersionId,
      cutoffAt,
      generatedAt,
      retentionMode: parsed.retentionMode,
    });
    if (!reportInput) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "ChangeEvent version not found.",
        status: 404,
      });
    }
    return { duplicate: false as const, reportInput };
  });
  if (prepared.duplicate) return prepared.response;

  const bundle = await buildAuditExportBundle(
    prepared.reportInput,
    getServerEnv().REPORT_SIGNING_SECRET,
  );
  const stored = await storeAuditExport(bundle, {
    organizationId: actor.organizationId,
    changeEventId: parsed.changeEventId,
    changeEventVersionId: parsed.changeEventVersionId,
    retentionMode: parsed.retentionMode,
    ...(retainUntil ? { retainUntil } : {}),
  });

  return withTenantContext(actor, async (transaction) => {
    const [existing] = await transaction
      .select({
        id: reportBundles.id,
        storageObjectKey: reportBundles.storageObjectKey,
        sha256: reportBundles.sha256,
      })
      .from(reportBundles)
      .where(
        and(
          eq(reportBundles.organizationId, actor.organizationId),
          eq(reportBundles.changeEventVersionId, parsed.changeEventVersionId),
          eq(reportBundles.sha256, stored.sha256),
        ),
      )
      .limit(1);
    const bundleRow =
      existing ??
      (
        await transaction
          .insert(reportBundles)
          .values({
            organizationId: actor.organizationId,
            changeEventVersionId: parsed.changeEventVersionId,
            generatedByMembershipId: actor.actorMembershipId,
            storageObjectKey: stored.objectKey,
            sha256: stored.sha256,
            manifest: bundle.manifest,
            cutoffAt,
            lockedAt: generatedAt,
            createdAt: generatedAt,
          })
          .returning({
            id: reportBundles.id,
            storageObjectKey: reportBundles.storageObjectKey,
            sha256: reportBundles.sha256,
          })
      )[0];
    if (!bundleRow) throw new Error("Report bundle insert returned no row.");

    const response: GenerationResponse = {
      reportBundleId: bundleRow.id,
      storageObjectKey: bundleRow.storageObjectKey,
      sha256: bundleRow.sha256,
      retentionMode: stored.retentionMode,
      worm: stored.retentionMode === "object_lock",
      ...(stored.retainUntil ? { retainUntil: stored.retainUntil } : {}),
    };
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "auditor",
      eventType: "report_bundle.generated",
      objectType: "report_bundle",
      objectId: bundleRow.id,
      objectVersionId: parsed.changeEventVersionId,
      payload: {
        changeEventId: parsed.changeEventId,
        changeEventVersionId: parsed.changeEventVersionId,
        storageObjectKey: bundleRow.storageObjectKey,
        sha256: bundleRow.sha256,
        retentionMode: response.retentionMode,
        worm: response.worm,
      },
      occurredAt: generatedAt,
    });
    await transaction
      .update(outboxEvents)
      .set({
        payload: { ...response, actorMembershipId: actor.actorMembershipId },
      })
      .where(
        and(
          eq(outboxEvents.organizationId, actor.organizationId),
          eq(outboxEvents.idempotencyKey, parsed.idempotencyKey),
        ),
      );

    return response;
  });
}
