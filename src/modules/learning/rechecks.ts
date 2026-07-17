import "server-only";

import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import {
  caseRetirements,
  divergenceCases,
  divergenceCaseVersions,
  divergences,
  notifications,
  probeAssignments,
  probeDeliveryEvents,
  recheckAssignments,
} from "@/db/schema";
import { withOrganizationContext } from "@/db/tenant-context";
import { getDatabase } from "@/db/client";

export async function dispatchRecheck(input: {
  organizationId: string;
  actorMembershipId: string;
  remediationAssignmentId: string;
  intervalDays: 30 | 90;
}) {
  return withOrganizationContext(input.organizationId, async (transaction) => {
    const [recheck] = await transaction
      .select()
      .from(recheckAssignments)
      .where(
        and(
          eq(
            recheckAssignments.remediationAssignmentId,
            input.remediationAssignmentId,
          ),
          eq(recheckAssignments.intervalDays, input.intervalDays),
        ),
      )
      .limit(1);
    if (!recheck || !["scheduled", "due"].includes(recheck.status))
      return { status: recheck?.status ?? "missing" };
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`recheck:${recheck.id}`}, 0))`,
    );
    const [original] = await transaction
      .select({ identityId: divergenceCaseVersions.divergenceCaseId })
      .from(divergenceCaseVersions)
      .where(eq(divergenceCaseVersions.id, recheck.originalCaseVersionId))
      .limit(1);
    if (!original)
      throw new Error("The original recheck case no longer exists.");
    const siblings = await transaction
      .select({
        selectedCaseVersionId: recheckAssignments.selectedCaseVersionId,
      })
      .from(recheckAssignments)
      .where(
        eq(
          recheckAssignments.remediationAssignmentId,
          recheck.remediationAssignmentId,
        ),
      );
    const usedVersionIds = siblings.flatMap((item) =>
      item.selectedCaseVersionId ? [item.selectedCaseVersionId] : [],
    );
    const usedIdentities = new Set([original.identityId]);
    if (usedVersionIds.length) {
      const rows = await transaction
        .select({ id: divergenceCaseVersions.divergenceCaseId })
        .from(divergenceCaseVersions)
        .where(inArray(divergenceCaseVersions.id, usedVersionIds));
      rows.forEach((row) => usedIdentities.add(row.id));
    }
    const candidates = await transaction
      .select({
        id: divergenceCaseVersions.id,
        identityId: divergenceCaseVersions.divergenceCaseId,
        supersedesId: divergenceCaseVersions.supersedesCaseVersionId,
      })
      .from(divergenceCaseVersions)
      .innerJoin(
        divergenceCases,
        eq(divergenceCases.id, divergenceCaseVersions.divergenceCaseId),
      )
      .leftJoin(
        caseRetirements,
        eq(caseRetirements.caseVersionId, divergenceCaseVersions.id),
      )
      .where(
        and(
          eq(divergenceCases.divergenceId, recheck.divergenceId),
          eq(divergenceCaseVersions.recordStatus, "approved"),
          isNull(caseRetirements.id),
        ),
      )
      .orderBy(asc(divergenceCaseVersions.createdAt));
    const supersededIds = new Set(
      candidates
        .map((item) => item.supersedesId)
        .filter((id): id is string => Boolean(id)),
    );
    const selected = candidates.find(
      (item) =>
        !usedIdentities.has(item.identityId) && !supersededIds.has(item.id),
    );
    if (!selected) {
      await transaction
        .update(recheckAssignments)
        .set({ status: "blocked_no_case" })
        .where(eq(recheckAssignments.id, recheck.id));
      return { status: "blocked_no_case" };
    }
    const now = new Date();
    const [divergence] = await transaction
      .select({ changeEventVersionId: divergences.changeEventVersionId })
      .from(divergences)
      .where(eq(divergences.id, recheck.divergenceId))
      .limit(1);
    if (!divergence)
      throw new Error("The recheck divergence no longer exists.");
    const [assignment] = await transaction
      .insert(probeAssignments)
      .values({
        organizationId: input.organizationId,
        personId: recheck.personId,
        caseVersionId: selected.id,
        divergenceId: recheck.divergenceId,
        changeEventVersionId: divergence.changeEventVersionId,
        recheckAssignmentId: recheck.id,
        assignmentKind: input.intervalDays === 30 ? "recheck_30" : "recheck_90",
        status: "assigned",
        assignedAt: now,
        dueAt: new Date(now.getTime() + 7 * 86_400_000),
        idempotencyKey: `recheck:${recheck.id}`,
      })
      .onConflictDoNothing()
      .returning({ id: probeAssignments.id });
    if (!assignment)
      throw new Error("The recheck assignment could not be created.");
    await transaction
      .update(recheckAssignments)
      .set({
        status: "dispatched",
        selectedCaseVersionId: selected.id,
        dispatchedAt: now,
      })
      .where(eq(recheckAssignments.id, recheck.id));
    await transaction.insert(probeDeliveryEvents).values({
      organizationId: input.organizationId,
      probeAssignmentId: assignment.id,
      eventType: "assigned",
      channel: "in_app",
      providerTimestamp: now,
      metadata: { recheckIntervalDays: input.intervalDays },
    });
    await transaction.insert(notifications).values({
      organizationId: input.organizationId,
      personId: recheck.personId,
      type: "recheck_assigned",
      title: `${input.intervalDays}-day check ready`,
      bodySummary: "A different short workplace scenario is ready.",
      actionPath: `/app/learning/probes/${assignment.id}`,
      objectType: "probe_assignment",
      objectId: assignment.id,
    });
    return { status: "dispatched", assignmentId: assignment.id };
  });
}

export async function listActiveOrganizationIds(): Promise<string[]> {
  const result = await getDatabase().execute<{ organization_id: string }>(
    sql`select organization_id from app.active_organization_ids()`,
  );
  return result.rows.map((row) => row.organization_id);
}

export async function dispatchDueRechecksForOrganization(
  organizationId: string,
): Promise<{ dispatched: number; blocked: number }> {
  const due = await withOrganizationContext(
    organizationId,
    async (transaction) =>
      transaction
        .select({
          remediationAssignmentId: recheckAssignments.remediationAssignmentId,
          intervalDays: recheckAssignments.intervalDays,
        })
        .from(recheckAssignments)
        .where(
          and(
            inArray(recheckAssignments.status, ["scheduled", "due"]),
            lte(recheckAssignments.dueAt, new Date()),
          ),
        )
        .limit(500),
  );
  let dispatched = 0;
  let blocked = 0;
  for (const item of due) {
    const outcome = await dispatchRecheck({
      organizationId,
      actorMembershipId: "system",
      remediationAssignmentId: item.remediationAssignmentId,
      intervalDays: item.intervalDays as 30 | 90,
    });
    if (outcome.status === "dispatched") dispatched += 1;
    if (outcome.status === "blocked_no_case") blocked += 1;
  }
  return { dispatched, blocked };
}
