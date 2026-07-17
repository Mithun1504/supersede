import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db/client";
import {
  approvalRecords,
  auditEvents,
  membershipRoles,
  outboxEvents,
  reportBundles,
} from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { assertIdempotencyActor } from "@/lib/security/idempotency";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const idempotencyKeySchema = z.string().trim().min(8).max(255);
const uuidSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(1).max(2_000);
const retentionModeSchema = z.enum(["standard", "object_lock"]);
const optionalRetainUntilSchema = z.iso.datetime().optional().nullable();

export type ExportApprovalResponse = {
  reportBundleId: string;
  retentionMode?: "standard" | "object_lock";
  worm?: boolean;
  retainUntil?: string;
};

export async function requireAuditor(
  transaction: Transaction,
  actor: TenantContext,
) {
  const [role] = await transaction
    .select({ roleCode: membershipRoles.roleCode })
    .from(membershipRoles)
    .where(
      and(
        eq(membershipRoles.organizationId, actor.organizationId),
        eq(membershipRoles.membershipId, actor.actorMembershipId),
        eq(membershipRoles.roleCode, "auditor"),
      ),
    )
    .limit(1);
  if (!role) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "The auditor role is required.",
      status: 403,
    });
  }
}

async function reserveEvent(
  transaction: Transaction,
  input: {
    organizationId: string;
    idempotencyKey: string;
    eventName: string;
    reportBundleId: string;
    actorMembershipId: string;
    payload?: Record<string, unknown>;
  },
) {
  const payload = {
    reportBundleId: input.reportBundleId,
    actorMembershipId: input.actorMembershipId,
    ...(input.payload ?? {}),
  };
  const [event] = await transaction
    .insert(outboxEvents)
    .values({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      eventName: input.eventName,
      aggregateType: "report_bundle",
      aggregateId: input.reportBundleId,
      payload,
    })
    .onConflictDoNothing({
      target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
    })
    .returning({
      eventName: outboxEvents.eventName,
      payload: outboxEvents.payload,
    });
  if (event) return { duplicate: false, payload: event.payload };

  const [existing] = await transaction
    .select({
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
  if (existing.eventName !== input.eventName) {
    throw new AppError({
      code: "CONFLICT",
      message: "The idempotency key was already used for another operation.",
      status: 409,
    });
  }
  return { duplicate: true, payload: existing.payload };
}

function existingResponse(
  payload: Record<string, unknown>,
): ExportApprovalResponse {
  const retentionMode = retentionModeSchema
    .optional()
    .parse(payload.retentionMode);
  const retainUntil = z.iso.datetime().optional().parse(payload.retainUntil);
  return {
    reportBundleId: uuidSchema.parse(payload.reportBundleId),
    ...(retentionMode
      ? { retentionMode, worm: retentionMode === "object_lock" }
      : {}),
    ...(retainUntil ? { retainUntil } : {}),
  };
}

async function getReportBundle(
  transaction: Transaction,
  organizationId: string,
  reportBundleId: string,
) {
  const [bundle] = await transaction
    .select({ id: reportBundles.id })
    .from(reportBundles)
    .where(
      and(
        eq(reportBundles.organizationId, organizationId),
        eq(reportBundles.id, reportBundleId),
      ),
    )
    .limit(1);
  if (!bundle) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Report bundle not found.",
      status: 404,
    });
  }
}

export async function authorizeExportRelease(
  actor: TenantContext,
  input: { idempotencyKey: string; reportBundleId: string; now?: Date },
): Promise<ExportApprovalResponse> {
  const reportBundleId = uuidSchema.parse(input.reportBundleId);
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireAuditor(transaction, actor);
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "export.released",
      reportBundleId,
      actorMembershipId: actor.actorMembershipId,
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingResponse(reservation.payload);
    }

    await getReportBundle(transaction, actor.organizationId, reportBundleId);
    await transaction.insert(approvalRecords).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "auditor",
      objectType: "report_bundle",
      objectId: reportBundleId,
      objectVersionId: reportBundleId,
      action: "export_released",
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "auditor",
      eventType: "export.released",
      objectType: "report_bundle",
      objectId: reportBundleId,
      objectVersionId: reportBundleId,
      payload: {},
      occurredAt: now,
    });

    return { reportBundleId };
  });
}

export async function approveRetentionChange(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    reportBundleId: string;
    retentionMode: "standard" | "object_lock";
    reason: string;
    retainUntil?: string | null | undefined;
    now?: Date;
  },
): Promise<ExportApprovalResponse> {
  const reportBundleId = uuidSchema.parse(input.reportBundleId);
  const retentionMode = retentionModeSchema.parse(input.retentionMode);
  const reason = reasonSchema.parse(input.reason);
  const retainUntilInput = optionalRetainUntilSchema.parse(input.retainUntil);
  const retainUntil = retainUntilInput ? new Date(retainUntilInput) : null;
  if (retentionMode === "object_lock" && !retainUntil) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Object Lock retention requires retainUntil.",
      status: 422,
    });
  }
  if (retainUntil && retainUntil <= new Date()) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Retention deadline must be in the future.",
      status: 422,
    });
  }
  const now = input.now ?? new Date();
  const payload = {
    retentionMode,
    reason,
    ...(retainUntil ? { retainUntil: retainUntil.toISOString() } : {}),
  };

  return withTenantContext(actor, async (transaction) => {
    await requireAuditor(transaction, actor);
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "retention.changed",
      reportBundleId,
      actorMembershipId: actor.actorMembershipId,
      payload,
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingResponse(reservation.payload);
    }

    await getReportBundle(transaction, actor.organizationId, reportBundleId);
    await transaction.insert(approvalRecords).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "auditor",
      objectType: "report_bundle",
      objectId: reportBundleId,
      objectVersionId: reportBundleId,
      action: "retention_changed",
      metadata: { ...payload, worm: retentionMode === "object_lock" },
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "auditor",
      eventType: "retention.changed",
      objectType: "report_bundle",
      objectId: reportBundleId,
      objectVersionId: reportBundleId,
      payload: { ...payload, worm: retentionMode === "object_lock" },
      occurredAt: now,
    });

    return {
      reportBundleId,
      retentionMode,
      worm: retentionMode === "object_lock",
      ...(retainUntil ? { retainUntil: retainUntil.toISOString() } : {}),
    };
  });
}
