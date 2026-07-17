import "server-only";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import {
  artifactOwners,
  artifactRemediations,
  artifactVersions,
  artifacts,
  changeEvents,
  changeEventVersions,
  changeImpacts,
  corpusArtifacts,
  sources,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordApprovalDecision } from "@/modules/audit/approval-policy";
import { recordMembershipEvent } from "@/modules/audit/service";
import { getAuthenticationAssurance } from "@/modules/identity/auth";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function submitArtifactRemediation(
  actor: CurrentActor,
  remediationId: string,
  resolvedArtifactVersionId: string,
): Promise<void> {
  authorize(actor, "artifact.remediate_owned");
  await withTenantContext(context(actor), async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`remediation:${remediationId}`}, 0))`,
    );
    const [remediation] = await transaction
      .select({
        id: artifactRemediations.id,
        artifactId: artifactRemediations.artifactId,
        impactedArtifactVersionId:
          artifactRemediations.impactedArtifactVersionId,
        assignedToMembershipId: artifactRemediations.assignedToMembershipId,
        status: artifactRemediations.status,
      })
      .from(artifactRemediations)
      .where(eq(artifactRemediations.id, remediationId))
      .limit(1);
    if (!remediation)
      throw new AppError({
        code: "NOT_FOUND",
        message: "Remediation task not found.",
        status: 404,
      });
    const [ownership] = await transaction
      .select({ id: artifactOwners.id })
      .from(artifactOwners)
      .where(
        and(
          eq(artifactOwners.artifactId, remediation.artifactId),
          eq(artifactOwners.membershipId, actor.membership.id),
          isNull(artifactOwners.effectiveTo),
        ),
      )
      .limit(1);
    if (
      remediation.assignedToMembershipId !== actor.membership.id &&
      !ownership
    )
      throw new AppError({
        code: "FORBIDDEN",
        message:
          "Only an active owner or assignee can submit this remediation.",
        status: 403,
      });
    if (
      !["open", "assigned", "in_progress", "rejected"].includes(
        remediation.status,
      )
    )
      throw new AppError({
        code: "CONFLICT",
        message: "This remediation is not accepting a new submission.",
        status: 409,
      });
    const [successor] = await transaction
      .select({
        id: artifactVersions.id,
        artifactId: artifactVersions.artifactId,
        supersedesArtifactVersionId:
          artifactVersions.supersedesArtifactVersionId,
      })
      .from(artifactVersions)
      .where(eq(artifactVersions.id, resolvedArtifactVersionId))
      .limit(1);
    if (
      !successor ||
      successor.artifactId !== remediation.artifactId ||
      successor.supersedesArtifactVersionId !==
        remediation.impactedArtifactVersionId
    )
      throw new AppError({
        code: "VALIDATION_FAILED",
        message:
          "The submitted version must directly supersede the impacted artifact version.",
        status: 422,
      });
    await transaction
      .update(artifactRemediations)
      .set({
        resolvedArtifactVersionId,
        status: "submitted",
        assignedToMembershipId: actor.membership.id,
      })
      .where(eq(artifactRemediations.id, remediation.id));
    await recordMembershipEvent(transaction, {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
      eventType: "artifact_remediation.submitted",
      objectType: "artifact_remediation",
      objectId: remediation.id,
      objectVersionId: resolvedArtifactVersionId,
    });
  });
}

export async function verifyArtifactRemediation(
  actor: CurrentActor,
  remediationId: string,
): Promise<void> {
  authorize(actor, "artifact.verify");
  const assurance = await getAuthenticationAssurance();
  await withTenantContext(context(actor), async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`remediation-verify:${remediationId}`}, 0))`,
    );
    const [remediation] = await transaction
      .select({
        id: artifactRemediations.id,
        artifactId: artifactRemediations.artifactId,
        impactedArtifactVersionId:
          artifactRemediations.impactedArtifactVersionId,
        resolvedArtifactVersionId:
          artifactRemediations.resolvedArtifactVersionId,
        status: artifactRemediations.status,
        creatorMembershipId: artifactVersions.createdByMembershipId,
      })
      .from(artifactRemediations)
      .leftJoin(
        artifactVersions,
        eq(artifactVersions.id, artifactRemediations.resolvedArtifactVersionId),
      )
      .where(eq(artifactRemediations.id, remediationId))
      .limit(1);
    if (
      !remediation?.resolvedArtifactVersionId ||
      remediation.status !== "submitted"
    )
      throw new AppError({
        code: "CONFLICT",
        message: "Only a submitted successor can be verified.",
        status: 409,
      });
    const decision = await recordApprovalDecision(transaction, actor, {
      objectType: "artifact_remediation",
      objectId: remediation.id,
      objectVersionId: remediation.resolvedArtifactVersionId,
      action: "verify",
      ...(remediation.creatorMembershipId
        ? { creatorMembershipId: remediation.creatorMembershipId }
        : {}),
      authenticationAgeSeconds: assurance.authenticationAgeSeconds,
      mfaVerified: assurance.mfaVerified,
    });
    if (!decision.satisfied) return;
    await transaction
      .update(artifactVersions)
      .set({ recordStatus: "superseded" })
      .where(
        and(
          eq(artifactVersions.artifactId, remediation.artifactId),
          ne(artifactVersions.id, remediation.resolvedArtifactVersionId),
          eq(artifactVersions.recordStatus, "approved"),
        ),
      );
    await transaction
      .update(artifactVersions)
      .set({ recordStatus: "approved" })
      .where(eq(artifactVersions.id, remediation.resolvedArtifactVersionId));
    await transaction
      .update(artifactRemediations)
      .set({
        status: "verified",
        verifiedByMembershipId: actor.membership.id,
        verifiedAt: new Date(),
      })
      .where(eq(artifactRemediations.id, remediation.id));
    await recordMembershipEvent(transaction, {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
      eventType: "artifact_remediation.verified",
      objectType: "artifact_remediation",
      objectId: remediation.id,
      objectVersionId: remediation.resolvedArtifactVersionId,
    });
  });
}

export async function getRemediationDetail(
  actor: CurrentActor,
  remediationId: string,
) {
  if (
    !actor.permissions.includes("artifact.remediate_owned") &&
    !actor.permissions.includes("artifact.verify")
  )
    authorize(actor, "artifact.remediate_owned");
  return withTenantContext(context(actor), async (transaction) => {
    const [row] = await transaction
      .select({
        id: artifactRemediations.id,
        status: artifactRemediations.status,
        requiredAction: artifactRemediations.requiredAction,
        assignedToMembershipId: artifactRemediations.assignedToMembershipId,
        artifactId: artifactRemediations.artifactId,
        artifactTitle: artifacts.title,
        artifactKind: artifacts.kind,
        impactedVersionLabel: artifactVersions.versionLabel,
        corpusId: corpusArtifacts.corpusId,
        sourceTitle: sources.title,
        oldRule: changeEventVersions.oldRule,
        newRule: changeEventVersions.newRule,
        diffSummary: changeEventVersions.diffSummary,
      })
      .from(artifactRemediations)
      .innerJoin(
        changeImpacts,
        eq(changeImpacts.id, artifactRemediations.changeImpactId),
      )
      .innerJoin(
        changeEventVersions,
        eq(changeEventVersions.id, changeImpacts.changeEventVersionId),
      )
      .innerJoin(
        changeEvents,
        eq(changeEvents.id, changeEventVersions.changeEventId),
      )
      .innerJoin(sources, eq(sources.id, changeEvents.sourceId))
      .innerJoin(artifacts, eq(artifacts.id, artifactRemediations.artifactId))
      .innerJoin(
        artifactVersions,
        eq(artifactVersions.id, artifactRemediations.impactedArtifactVersionId),
      )
      .innerJoin(
        corpusArtifacts,
        and(
          eq(corpusArtifacts.artifactId, artifactRemediations.artifactId),
          isNull(corpusArtifacts.removedAt),
        ),
      )
      .where(eq(artifactRemediations.id, remediationId))
      .limit(1);
    if (!row) return null;
    const [ownership] = await transaction
      .select({ id: artifactOwners.id })
      .from(artifactOwners)
      .where(
        and(
          eq(artifactOwners.artifactId, row.artifactId),
          eq(artifactOwners.membershipId, actor.membership.id),
          isNull(artifactOwners.effectiveTo),
        ),
      )
      .limit(1);
    if (
      !actor.permissions.includes("artifact.verify") &&
      row.assignedToMembershipId !== actor.membership.id &&
      !ownership
    )
      throw new AppError({
        code: "FORBIDDEN",
        message: "This remediation is not assigned to you.",
        status: 403,
      });
    return row;
  });
}

function context(actor: CurrentActor) {
  return {
    organizationId: actor.organization.id,
    actorMembershipId: actor.membership.id,
  };
}
