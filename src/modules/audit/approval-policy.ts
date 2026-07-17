import "server-only";

import { and, count, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  approvalPolicies,
  approvalPolicyRoles,
  approvalRecords,
} from "@/db/schema";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import type { CurrentActor } from "@/modules/identity/policy";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ApprovalDecisionInput = {
  objectType: string;
  objectId: string;
  objectVersionId: string;
  action: string;
  creatorMembershipId?: string;
  requesterMembershipId?: string;
  authenticationAgeSeconds: number;
  mfaVerified: boolean;
  metadata?: Record<string, unknown>;
};

export type ApprovalDecisionResult = {
  approvalRecordId: string;
  approvalsRecorded: number;
  approvalsRequired: number;
  satisfied: boolean;
};

export async function recordApprovalDecision(
  transaction: Transaction,
  actor: CurrentActor,
  input: ApprovalDecisionInput,
): Promise<ApprovalDecisionResult> {
  const [policy] = await transaction
    .select({
      id: approvalPolicies.id,
      minimumApprovals: approvalPolicies.minimumApprovals,
      requireDistinctCreator: approvalPolicies.requireDistinctCreator,
      requireDistinctRequester: approvalPolicies.requireDistinctRequester,
      requireRecentAuth: approvalPolicies.requireRecentAuth,
      requireMfa: approvalPolicies.requireMfa,
    })
    .from(approvalPolicies)
    .where(
      and(
        eq(approvalPolicies.organizationId, actor.organization.id),
        eq(approvalPolicies.objectType, input.objectType),
        eq(approvalPolicies.action, input.action),
        eq(approvalPolicies.status, "approved"),
      ),
    )
    .limit(1);

  if (!policy) {
    throw new AppError({
      code: "CONFLICT",
      message: "No active approval policy covers this action.",
      status: 409,
    });
  }

  const eligible = await transaction
    .select({ roleCode: approvalPolicyRoles.roleCode })
    .from(approvalPolicyRoles)
    .where(eq(approvalPolicyRoles.approvalPolicyId, policy.id));
  const eligibleCodes = eligible.map((row) => row.roleCode);
  const actorRole = actor.roles.find((role) => eligibleCodes.includes(role));
  if (!actorRole) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Your active roles cannot approve this action.",
      status: 403,
    });
  }
  if (
    policy.requireDistinctCreator &&
    input.creatorMembershipId === actor.membership.id
  ) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "The creator cannot approve this exact version.",
      status: 403,
    });
  }
  if (
    policy.requireDistinctRequester &&
    input.requesterMembershipId === actor.membership.id
  ) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "The requester cannot authorize this exact version.",
      status: 403,
    });
  }
  if (policy.requireRecentAuth && input.authenticationAgeSeconds > 300) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Recent authentication is required for this approval.",
      status: 403,
    });
  }
  if (policy.requireMfa && !input.mfaVerified) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "MFA verification is required for this approval.",
      status: 403,
    });
  }

  const [record] = await transaction
    .insert(approvalRecords)
    .values({
      organizationId: actor.organization.id,
      approvalPolicyId: policy.id,
      actorMembershipId: actor.membership.id,
      actorRoleCode: actorRole,
      objectType: input.objectType,
      objectId: input.objectId,
      objectVersionId: input.objectVersionId,
      action: input.action,
      authenticationAgeSeconds: input.authenticationAgeSeconds,
      mfaVerified: input.mfaVerified,
      metadata: input.metadata ?? {},
    })
    .returning({ id: approvalRecords.id });
  if (!record) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "The approval record could not be created.",
      status: 500,
    });
  }

  const [total] = await transaction
    .select({ value: count() })
    .from(approvalRecords)
    .where(
      and(
        eq(approvalRecords.approvalPolicyId, policy.id),
        eq(approvalRecords.objectVersionId, input.objectVersionId),
        eq(approvalRecords.action, input.action),
      ),
    );
  const approvalsRecorded = total?.value ?? 0;

  await recordMembershipEvent(transaction, {
    organizationId: actor.organization.id,
    actorMembershipId: actor.membership.id,
    eventType: "approval.recorded",
    objectType: input.objectType,
    objectId: input.objectId,
    objectVersionId: input.objectVersionId,
    payload: {
      action: input.action,
      policyId: policy.id,
      actorRole,
      approvalsRecorded,
      approvalsRequired: policy.minimumApprovals,
    },
  });

  return {
    approvalRecordId: record.id,
    approvalsRecorded,
    approvalsRequired: policy.minimumApprovals,
    satisfied: approvalsRecorded >= policy.minimumApprovals,
  };
}
