import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  artifacts,
  artifactVersions,
  auditEvents,
  claims,
  claimVersions,
  outboxEvents,
} from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import type { ExtractionResponse } from "@/modules/corpus/extraction";

const sourceHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export async function ensureIngestedArtifactVersion(
  actor: TenantContext,
  input: {
    documentTitle: string;
    sourceHash: string;
    text: string;
    now?: Date;
  },
) {
  const documentTitle = z
    .string()
    .trim()
    .min(1)
    .max(255)
    .parse(input.documentTitle);
  const sourceHash = sourceHashSchema.parse(input.sourceHash);
  const fileSha256 = sourceHash.slice("sha256:".length);
  const computed = createHash("sha256").update(input.text).digest("hex");
  if (computed !== fileSha256) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Source hash does not match the submitted text.",
      status: 422,
    });
  }
  const canonicalKey = `live-ingestion-${fileSha256}`;
  const versionLabel = `ingestion-${fileSha256.slice(0, 16)}`;
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    const [createdArtifact] = await transaction
      .insert(artifacts)
      .values({
        organizationId: actor.organizationId,
        kind: "protocol",
        ownerMembershipId: actor.actorMembershipId,
        canonicalKey,
        title: documentTitle,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [artifacts.organizationId, artifacts.canonicalKey],
      })
      .returning({ id: artifacts.id });
    const [artifact] = createdArtifact
      ? [createdArtifact]
      : await transaction
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(
            and(
              eq(artifacts.organizationId, actor.organizationId),
              eq(artifacts.canonicalKey, canonicalKey),
            ),
          )
          .limit(1);
    if (!artifact)
      throw new Error("Ingested artifact reservation disappeared.");

    const artifactVersionId = randomUUID();
    const [createdVersion] = await transaction
      .insert(artifactVersions)
      .values({
        id: artifactVersionId,
        organizationId: actor.organizationId,
        artifactId: artifact.id,
        versionLabel,
        bodyText: input.text,
        fileSha256,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [artifactVersions.artifactId, artifactVersions.versionLabel],
      })
      .returning({ id: artifactVersions.id });
    const [version] = createdVersion
      ? [createdVersion]
      : await transaction
          .select({ id: artifactVersions.id })
          .from(artifactVersions)
          .where(
            and(
              eq(artifactVersions.organizationId, actor.organizationId),
              eq(artifactVersions.artifactId, artifact.id),
              eq(artifactVersions.versionLabel, versionLabel),
            ),
          )
          .limit(1);
    if (!version) throw new Error("Ingested artifact version disappeared.");

    if (createdVersion) {
      await transaction.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorMembershipId: actor.actorMembershipId,
        eventType: "corpus.document_ingested",
        objectType: "artifact",
        objectId: artifact.id,
        objectVersionId: version.id,
        payload: { sourceHash, artifactKind: "protocol" },
        occurredAt: now,
      });
      await transaction.insert(outboxEvents).values({
        organizationId: actor.organizationId,
        eventName: "document.ingested",
        aggregateType: "artifact_version",
        aggregateId: version.id,
        idempotencyKey: `document.ingested:${version.id}:${fileSha256}`,
        payload: {
          artifactId: artifact.id,
          artifactVersionId: version.id,
          actorMembershipId: actor.actorMembershipId,
          title: documentTitle,
        },
      });
    }

    return { artifactId: artifact.id, artifactVersionId: version.id };
  });
}

export async function persistExtractedClaims(
  actor: TenantContext,
  input: {
    artifactId: string;
    artifactVersionId: string;
    sourceHash: string;
    result: ExtractionResponse;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const sourceHash = sourceHashSchema.parse(input.sourceHash);
  const fileSha256 = sourceHash.slice("sha256:".length);
  const provenance = input.result.provenance;
  if (!input.result.live || !provenance) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Only live extraction results can enter the review queue.",
      status: 422,
    });
  }

  return withTenantContext(actor, async (transaction) => {
    const [version] = await transaction
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(
        and(
          eq(artifactVersions.organizationId, actor.organizationId),
          eq(artifactVersions.artifactId, input.artifactId),
          eq(artifactVersions.id, input.artifactVersionId),
          eq(artifactVersions.fileSha256, fileSha256),
        ),
      )
      .limit(1);
    if (!version) {
      throw new AppError({
        code: "VALIDATION_FAILED",
        message:
          "Extraction target does not match the ingested artifact version.",
        status: 422,
      });
    }

    let persistedClaimCount = 0;
    let quoteVerifiedClaimCount = 0;
    for (const extracted of input.result.claims) {
      if (
        !extracted.quoteVerified ||
        extracted.startOffset === undefined ||
        extracted.endOffset === undefined
      ) {
        continue;
      }
      quoteVerifiedClaimCount += 1;
      const claimHash = createHash("sha256")
        .update(extracted.text.trim().replace(/\s+/g, " "))
        .digest("hex");
      const canonicalKey = `extracted-${claimHash}`;
      const [createdClaim] = await transaction
        .insert(claims)
        .values({
          organizationId: actor.organizationId,
          artifactVersionId: input.artifactVersionId,
          canonicalKey,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [claims.artifactVersionId, claims.canonicalKey],
        })
        .returning({ id: claims.id });
      const [claim] = createdClaim
        ? [createdClaim]
        : await transaction
            .select({ id: claims.id })
            .from(claims)
            .where(
              and(
                eq(claims.organizationId, actor.organizationId),
                eq(claims.artifactVersionId, input.artifactVersionId),
                eq(claims.canonicalKey, canonicalKey),
              ),
            )
            .limit(1);
      if (!claim) throw new Error("Extracted claim reservation disappeared.");

      const [createdVersion] = await transaction
        .insert(claimVersions)
        .values({
          organizationId: actor.organizationId,
          claimId: claim.id,
          versionLabel: `extraction-${fileSha256.slice(0, 16)}`,
          text: extracted.text,
          evidenceQuote: extracted.exactQuote,
          evidenceStartOffset: extracted.startOffset,
          evidenceEndOffset: extracted.endOffset,
          evidenceChecksum: fileSha256,
          extractionRunId:
            provenance.externalResponseId ?? `live-${fileSha256.slice(0, 32)}`,
          promptVersion: provenance.promptVersion,
          modelId: provenance.model,
          confidence: extracted.confidence.toFixed(3),
          loadBearingScore: "0.000",
          loadBearingRationale:
            "Pending separate human-reviewed load-bearing assessment.",
          reviewStatus: extracted.reviewState,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [claimVersions.claimId, claimVersions.versionLabel],
        })
        .returning({ id: claimVersions.id });
      if (createdVersion) persistedClaimCount += 1;
    }

    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      eventType: "corpus.claims_extracted",
      objectType: "artifact",
      objectId: input.artifactId,
      objectVersionId: input.artifactVersionId,
      payload: {
        provider: provenance.provider,
        model: provenance.model,
        promptVersion: provenance.promptVersion,
        proposedClaimCount: input.result.claims.length,
        quoteVerifiedClaimCount,
        persistedClaimCount,
        unverifiedClaimCount:
          input.result.claims.length - quoteVerifiedClaimCount,
      },
      occurredAt: now,
    });

    return { persistedClaimCount };
  });
}
