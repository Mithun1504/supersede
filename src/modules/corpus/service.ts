import "server-only";

import { Buffer } from "node:buffer";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  artifactOwners,
  artifacts,
  artifactVersions,
  corpora,
  corpusArtifacts,
  corpusSources,
  documentChunks,
  documentVersions,
  organizationSettings,
  sources,
  sourceVersions,
  storageObjects,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import { chunkText, sha256 } from "@/modules/corpus/chunking";
import type {
  CreateCorpusInput,
  PasteDocumentInput,
} from "@/modules/corpus/contracts";
import {
  deleteWorkingObject,
  putDerivedText,
  type StoredObject,
} from "@/modules/corpus/storage";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

const parserName = "supersede-native-text";
const parserVersion = "1.0.0";

export async function createCorpus(
  actor: CurrentActor,
  input: CreateCorpusInput,
): Promise<string> {
  authorize(actor, "corpus.write");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [corpus] = await transaction
        .insert(corpora)
        .values({
          organizationId: actor.organization.id,
          name: input.name,
          description: input.description,
          createdByMembershipId: actor.membership.id,
        })
        .returning({ id: corpora.id });
      if (!corpus)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The corpus could not be created.",
          status: 500,
        });
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "corpus.created",
        objectType: "corpus",
        objectId: corpus.id,
        payload: { name: input.name },
      });
      return corpus.id;
    },
  );
}

export async function ingestPastedDocument(
  actor: CurrentActor,
  input: PasteDocumentInput,
): Promise<{
  objectPath: string;
  objectId: string;
  objectVersionId: string;
  documentVersionId: string;
  duplicate: boolean;
}> {
  authorize(actor, "corpus.write");
  const contentSha256 = sha256(input.content);
  const contentSize = Buffer.byteLength(input.content, "utf8");

  const preflight = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [corpus] = await transaction
        .select({ id: corpora.id })
        .from(corpora)
        .where(
          and(eq(corpora.id, input.corpusId), eq(corpora.status, "active")),
        )
        .limit(1);
      if (!corpus)
        throw new AppError({
          code: "NOT_FOUND",
          message: "The active corpus was not found.",
          status: 404,
        });
      const [settings] = await transaction
        .select({ maxUploadBytes: organizationSettings.maxUploadBytes })
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, actor.organization.id))
        .limit(1);
      if (!settings || contentSize > settings.maxUploadBytes)
        throw new AppError({
          code: "BAD_REQUEST",
          message: "The pasted document exceeds the organization upload limit.",
          status: 413,
        });
      const [existing] = await transaction
        .select({ id: documentVersions.id })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.contentSha256, contentSha256),
            eq(documentVersions.parserName, parserName),
            eq(documentVersions.parserVersion, parserVersion),
          ),
        )
        .limit(1);
      return { existingDocumentVersionId: existing?.id ?? null };
    },
  );

  let storedObject: StoredObject | null = null;
  if (!preflight.existingDocumentVersionId) {
    storedObject = await putDerivedText({
      organizationId: actor.organization.id,
      documentHash: contentSha256,
      content: input.content,
    });
  }

  try {
    const result = await withTenantContext(
      {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
      },
      async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.organization.id}:${contentSha256}:${parserVersion}`}, 0))`,
        );
        let [document] = await transaction
          .select({ id: documentVersions.id })
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.contentSha256, contentSha256),
              eq(documentVersions.parserName, parserName),
              eq(documentVersions.parserVersion, parserVersion),
            ),
          )
          .limit(1);
        let createdDocument = false;

        if (!document) {
          if (!storedObject)
            throw new AppError({
              code: "INTERNAL_ERROR",
              message: "Document storage state is inconsistent.",
              status: 500,
            });
          const [storage] = await transaction
            .insert(storageObjects)
            .values({
              organizationId: actor.organization.id,
              purpose: "derived_text",
              provider: storedObject.provider,
              bucketAlias: storedObject.bucketAlias,
              objectKey: storedObject.objectKey,
              sha256: contentSha256,
              sizeBytes: contentSize,
              mimeType: "text/plain; charset=utf-8",
              originalFilename: `${input.title}.txt`,
              scanStatus: "clean",
            })
            .returning({ id: storageObjects.id });
          if (!storage)
            throw new AppError({
              code: "INTERNAL_ERROR",
              message: "Storage metadata could not be created.",
              status: 500,
            });
          [document] = await transaction
            .insert(documentVersions)
            .values({
              organizationId: actor.organization.id,
              extractedTextStorageObjectId: storage.id,
              contentSha256,
              detectedMimeType: "text/plain; charset=utf-8",
              parserName,
              parserVersion,
              processingStatus: "completed",
              parserManifest: {
                ingestion: "paste",
                offsets: "utf16-code-units",
                normalized: false,
              },
              createdByMembershipId: actor.membership.id,
            })
            .returning({ id: documentVersions.id });
          if (!document)
            throw new AppError({
              code: "INTERNAL_ERROR",
              message: "Document version could not be created.",
              status: 500,
            });
          const chunks = chunkText(input.content);
          if (chunks.length > 0) {
            await transaction.insert(documentChunks).values(
              chunks.map((chunk) => ({
                organizationId: actor.organization.id,
                documentVersionId: document!.id,
                ...chunk,
                location: { ingestion: "paste" },
              })),
            );
            await transaction.execute(
              sql`update document_chunk set search_vector = to_tsvector('english', content) where document_version_id = ${document.id}`,
            );
          }
          createdDocument = true;
        }

        const governedObject = await persistGovernedObject(
          transaction,
          actor,
          input,
          document.id,
          contentSha256,
        );
        return {
          ...governedObject,
          documentVersionId: document.id,
          duplicate: !createdDocument,
        };
      },
    );
    if (storedObject && result.duplicate)
      await deleteWorkingObject(storedObject);
    return result;
  } catch (error) {
    if (storedObject) await deleteWorkingObject(storedObject);
    throw error;
  }
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function persistGovernedObject(
  transaction: Transaction,
  actor: CurrentActor,
  input: Omit<PasteDocumentInput, "content">,
  documentVersionId: string,
  contentSha256: string,
): Promise<{ objectPath: string; objectId: string; objectVersionId: string }> {
  if (input.documentType === "source") {
    if (!input.sourceKind)
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "Source kind is required.",
        status: 422,
      });
    const source = input.sourceId
      ? (
          await transaction
            .select({ id: sources.id })
            .from(sources)
            .where(eq(sources.id, input.sourceId))
            .limit(1)
        )[0]
      : (
          await transaction
            .insert(sources)
            .values({
              organizationId: actor.organization.id,
              kind: input.sourceKind,
              title: input.title,
              canonicalReference: input.externalReference || null,
              ownerMembershipId: actor.membership.id,
            })
            .returning({ id: sources.id })
        )[0];
    if (!source)
      throw new AppError({
        code: input.sourceId ? "NOT_FOUND" : "INTERNAL_ERROR",
        message: input.sourceId
          ? "The source to supersede was not found."
          : "Source could not be created.",
        status: input.sourceId ? 404 : 500,
      });
    if (input.sourceId) {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`source-version:${source.id}`}, 0))`,
      );
    }
    const [latest] = await transaction
      .select({
        id: sourceVersions.id,
        versionNumber: sourceVersions.versionNumber,
      })
      .from(sourceVersions)
      .where(eq(sourceVersions.sourceId, source.id))
      .orderBy(sql`${sourceVersions.versionNumber} desc`)
      .limit(1);
    const [version] = await transaction
      .insert(sourceVersions)
      .values({
        organizationId: actor.organization.id,
        sourceId: source.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        versionLabel: input.versionLabel,
        effectiveAt: input.effectiveAt,
        documentVersionId,
        supersedesSourceVersionId: latest?.id,
        createdByMembershipId: actor.membership.id,
      })
      .returning({ id: sourceVersions.id });
    if (!version)
      throw new AppError({
        code: "INTERNAL_ERROR",
        message: "Source version could not be created.",
        status: 500,
      });
    if (!input.sourceId) {
      await transaction.insert(corpusSources).values({
        organizationId: actor.organization.id,
        corpusId: input.corpusId,
        sourceId: source.id,
      });
    }
    await recordMembershipEvent(transaction, {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
      eventType: input.sourceId ? "source.version_created" : "source.created",
      objectType: "source",
      objectId: source.id,
      objectVersionId: version.id,
      payload: { corpusId: input.corpusId, contentSha256 },
      publish: {
        eventName: "document/ingested",
        payload: {
          documentVersionId,
          corpusId: input.corpusId,
          objectType: "source",
          objectId: source.id,
          objectVersionId: version.id,
        },
      },
    });
    return {
      objectPath: `/app/sources/${source.id}`,
      objectId: source.id,
      objectVersionId: version.id,
    };
  }

  if (!input.artifactKind)
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Artifact kind is required.",
      status: 422,
    });
  const artifact = input.artifactId
    ? (
        await transaction
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(eq(artifacts.id, input.artifactId))
          .limit(1)
      )[0]
    : (
        await transaction
          .insert(artifacts)
          .values({
            organizationId: actor.organization.id,
            kind: input.artifactKind,
            title: input.title,
            externalReference: input.externalReference || null,
          })
          .returning({ id: artifacts.id })
      )[0];
  if (!artifact)
    throw new AppError({
      code: input.artifactId ? "NOT_FOUND" : "INTERNAL_ERROR",
      message: input.artifactId
        ? "The artifact to supersede was not found."
        : "Artifact could not be created.",
      status: input.artifactId ? 404 : 500,
    });
  if (input.artifactId)
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`artifact-version:${artifact.id}`}, 0))`,
    );
  const [latestArtifactVersion] = await transaction
    .select({
      id: artifactVersions.id,
      versionNumber: artifactVersions.versionNumber,
    })
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifact.id))
    .orderBy(sql`${artifactVersions.versionNumber} desc`)
    .limit(1);
  const [version] = await transaction
    .insert(artifactVersions)
    .values({
      organizationId: actor.organization.id,
      artifactId: artifact.id,
      versionNumber: (latestArtifactVersion?.versionNumber ?? 0) + 1,
      versionLabel: input.versionLabel,
      effectiveAt: input.effectiveAt,
      documentVersionId,
      supersedesArtifactVersionId: latestArtifactVersion?.id,
      createdByMembershipId: actor.membership.id,
    })
    .returning({ id: artifactVersions.id });
  if (!version)
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Artifact version could not be created.",
      status: 500,
    });
  if (!input.artifactId) {
    await transaction.insert(artifactOwners).values({
      organizationId: actor.organization.id,
      artifactId: artifact.id,
      membershipId: actor.membership.id,
      ownerType: "primary",
      effectiveFrom: new Date(),
    });
    await transaction.insert(corpusArtifacts).values({
      organizationId: actor.organization.id,
      corpusId: input.corpusId,
      artifactId: artifact.id,
    });
  }
  await recordMembershipEvent(transaction, {
    organizationId: actor.organization.id,
    actorMembershipId: actor.membership.id,
    eventType: input.artifactId
      ? "artifact.version_created"
      : "artifact.created",
    objectType: "artifact",
    objectId: artifact.id,
    objectVersionId: version.id,
    payload: { corpusId: input.corpusId, contentSha256 },
    publish: {
      eventName: "document/ingested",
      payload: {
        documentVersionId,
        corpusId: input.corpusId,
        objectType: "artifact",
        objectId: artifact.id,
        objectVersionId: version.id,
      },
    },
  });
  return {
    objectPath: `/app/artifacts/${artifact.id}`,
    objectId: artifact.id,
    objectVersionId: version.id,
  };
}
