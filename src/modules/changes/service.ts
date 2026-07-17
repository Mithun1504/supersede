import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";

import {
  changeEvents,
  changeEventVersionCitations,
  changeEventVersions,
  documentVersions,
  evidenceSpans,
  sourceVersions,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { inngest } from "@/inngest/client";
import { getConfigurationStatus } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { getAuthenticationAssurance } from "@/modules/identity/auth";
import { recordApprovalDecision } from "@/modules/audit/approval-policy";
import { recordMembershipEvent } from "@/modules/audit/service";
import { verifyExactQuote } from "@/modules/ai/evidence";
import { loadDocumentChunks } from "@/modules/ai/retrieval";
import type { CreateChangeInput } from "@/modules/changes/contracts";
import { runPropagation } from "@/modules/changes/propagation";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function createAndSubmitChange(
  actor: CurrentActor,
  input: CreateChangeInput,
): Promise<string> {
  authorize(actor, "change.write");
  const versions = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    (transaction) =>
      transaction
        .select({
          id: sourceVersions.id,
          sourceId: sourceVersions.sourceId,
          documentVersionId: sourceVersions.documentVersionId,
          recordStatus: sourceVersions.recordStatus,
          contentSha256: documentVersions.contentSha256,
        })
        .from(sourceVersions)
        .innerJoin(
          documentVersions,
          eq(documentVersions.id, sourceVersions.documentVersionId),
        )
        .where(
          inArray(sourceVersions.id, [
            input.oldSourceVersionId,
            input.newSourceVersionId,
          ]),
        ),
  );
  const oldVersion = versions.find(
    (version) => version.id === input.oldSourceVersionId,
  );
  const newVersion = versions.find(
    (version) => version.id === input.newSourceVersionId,
  );
  if (!oldVersion || !newVersion || oldVersion.sourceId !== newVersion.sourceId)
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Old and new versions must belong to the same source.",
      status: 422,
    });
  if (
    !inArrayStatus(oldVersion.recordStatus, ["approved", "superseded"]) ||
    newVersion.recordStatus !== "approved"
  )
    throw new AppError({
      code: "CONFLICT",
      message:
        "The old version must be governed history and the new version must be approved current.",
      status: 409,
    });
  const [oldChunks, newChunks] = await Promise.all([
    loadDocumentChunks(actor, oldVersion.documentVersionId),
    loadDocumentChunks(actor, newVersion.documentVersionId),
  ]);
  const oldMatch = locateExactQuote(oldChunks, input.oldRule);
  const newMatch = locateExactQuote(newChunks, input.newRule);
  if (!oldMatch || !newMatch)
    throw new AppError({
      code: "VALIDATION_FAILED",
      message:
        "Each rule must be an exact contiguous quote from its selected immutable source version.",
      status: 422,
    });

  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [event] = await transaction
        .insert(changeEvents)
        .values({
          organizationId: actor.organization.id,
          sourceId: oldVersion.sourceId,
        })
        .returning({ id: changeEvents.id });
      if (!event)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "ChangeEvent could not be created.",
          status: 500,
        });
      const [version] = await transaction
        .insert(changeEventVersions)
        .values({
          organizationId: actor.organization.id,
          changeEventId: event.id,
          versionNumber: 1,
          oldSourceVersionId: oldVersion.id,
          newSourceVersionId: newVersion.id,
          oldRule: input.oldRule,
          newRule: input.newRule,
          affectedPopulation: input.affectedPopulation,
          exclusions: input.exclusions || null,
          unresolvedAmbiguity: input.unresolvedAmbiguity || null,
          diffSummary: input.diffSummary,
          status: "draft",
          enteredByMembershipId: actor.membership.id,
        })
        .returning({ id: changeEventVersions.id });
      if (!version)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "ChangeEvent version could not be created.",
          status: 500,
        });
      for (const [side, match, sourceVersion] of [
        ["old", oldMatch, oldVersion],
        ["new", newMatch, newVersion],
      ] as const) {
        const [evidence] = await transaction
          .insert(evidenceSpans)
          .values({
            organizationId: actor.organization.id,
            documentVersionId: sourceVersion.documentVersionId,
            documentChunkId: match.chunk.id,
            exactQuote: side === "old" ? input.oldRule : input.newRule,
            startOffset: match.startOffset,
            endOffset: match.endOffset,
            sourceContentSha256: sourceVersion.contentSha256,
            verificationStatus: "exact",
            verificationScore: "1.0000",
            verifiedAt: new Date(),
          })
          .returning({ id: evidenceSpans.id });
        if (!evidence)
          throw new AppError({
            code: "INTERNAL_ERROR",
            message: "Change citation could not be created.",
            status: 500,
          });
        await transaction.insert(changeEventVersionCitations).values({
          organizationId: actor.organization.id,
          changeEventVersionId: version.id,
          citationSide: side,
          sourceVersionId: sourceVersion.id,
          evidenceSpanId: evidence.id,
          position: 0,
        });
      }
      await transaction
        .update(changeEventVersions)
        .set({ status: "submitted", submittedAt: new Date() })
        .where(eq(changeEventVersions.id, version.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "change.submitted",
        objectType: "change_event",
        objectId: event.id,
        objectVersionId: version.id,
        payload: {
          oldSourceVersionId: oldVersion.id,
          newSourceVersionId: newVersion.id,
        },
      });
      return event.id;
    },
  );
}

export async function validateChange(
  actor: CurrentActor,
  changeEventVersionId: string,
): Promise<string> {
  authorize(actor, "change.validate");
  const assurance = await getAuthenticationAssurance();
  const validated = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`change-validation:${changeEventVersionId}`}, 0))`,
      );
      const [version] = await transaction
        .select()
        .from(changeEventVersions)
        .where(eq(changeEventVersions.id, changeEventVersionId))
        .limit(1);
      if (!version || version.status !== "submitted")
        throw new AppError({
          code: "CONFLICT",
          message:
            "Only the current submitted ChangeEvent version can be validated.",
          status: 409,
        });
      const [latest] = await transaction
        .select({ id: changeEventVersions.id })
        .from(changeEventVersions)
        .where(eq(changeEventVersions.changeEventId, version.changeEventId))
        .orderBy(desc(changeEventVersions.versionNumber))
        .limit(1);
      if (latest?.id !== version.id)
        throw new AppError({
          code: "CONFLICT",
          message: "A newer ChangeEvent version exists.",
          status: 409,
        });
      const sourceStates = await transaction
        .select({
          id: sourceVersions.id,
          sourceId: sourceVersions.sourceId,
          recordStatus: sourceVersions.recordStatus,
        })
        .from(sourceVersions)
        .where(
          inArray(sourceVersions.id, [
            version.oldSourceVersionId,
            version.newSourceVersionId,
          ]),
        );
      const oldSource = sourceStates.find(
        (source) => source.id === version.oldSourceVersionId,
      );
      const newSource = sourceStates.find(
        (source) => source.id === version.newSourceVersionId,
      );
      if (
        !oldSource ||
        !newSource ||
        oldSource.sourceId !== newSource.sourceId ||
        newSource.recordStatus !== "approved" ||
        !inArrayStatus(oldSource.recordStatus, ["approved", "superseded"])
      ) {
        throw new AppError({
          code: "CONFLICT",
          message:
            "Source governance changed after submission. Create a new ChangeEvent version against the current governed pair.",
          status: 409,
        });
      }
      const decision = await recordApprovalDecision(transaction, actor, {
        objectType: "change_event",
        objectId: version.changeEventId,
        objectVersionId: version.id,
        action: "validate",
        creatorMembershipId: version.enteredByMembershipId,
        authenticationAgeSeconds: assurance.authenticationAgeSeconds,
        mfaVerified: assurance.mfaVerified,
      });
      if (!decision.satisfied)
        return { changeEventId: version.changeEventId, shouldPropagate: false };
      await transaction
        .update(changeEventVersions)
        .set({ status: "validated" })
        .where(eq(changeEventVersions.id, version.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "change.validated",
        objectType: "change_event",
        objectId: version.changeEventId,
        objectVersionId: version.id,
        publish: {
          eventName: "change/validated",
          payload: {
            organizationId: actor.organization.id,
            changeEventVersionId: version.id,
            actorMembershipId: actor.membership.id,
          },
        },
      });
      return { changeEventId: version.changeEventId, shouldPropagate: true };
    },
  );
  if (validated.shouldPropagate) {
    if (getConfigurationStatus().inngest) {
      try {
        await inngest.send({
          name: "change/validated",
          data: {
            organizationId: actor.organization.id,
            changeEventVersionId,
            actorMembershipId: actor.membership.id,
          },
        });
      } catch {
        await runPropagation(actor, changeEventVersionId);
      }
    } else {
      await runPropagation(actor, changeEventVersionId);
    }
  }
  return validated.changeEventId;
}

function locateExactQuote(
  chunks: Awaited<ReturnType<typeof loadDocumentChunks>>,
  quote: string,
) {
  for (const chunk of chunks) {
    const verified = verifyExactQuote(chunk.content, quote, chunk.startOffset);
    if (verified.exact)
      return {
        chunk,
        startOffset: verified.startOffset,
        endOffset: verified.endOffset,
      };
  }
  return null;
}

function inArrayStatus<T extends string>(
  value: string,
  values: readonly T[],
): value is T {
  return (values as readonly string[]).includes(value);
}
