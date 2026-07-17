import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  corpora,
  documentChunks,
  documentVersions,
  organizationSettings,
  storageObjects,
  uploadSessions,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { getServerEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { chunkText, sha256 } from "@/modules/corpus/chunking";
import type {
  CompleteUploadInput,
  CreateUploadSessionInput,
} from "@/modules/corpus/contracts";
import {
  parseDocument,
  supportedUploadMimeTypes,
} from "@/modules/corpus/parsers";
import { persistGovernedObject } from "@/modules/corpus/service";
import {
  createQuarantineUploadUrl,
  deleteWorkingObject,
  putDerivedText,
  readWorkingObject,
  workingStorageLocation,
  type StoredObject,
} from "@/modules/corpus/storage";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function createUploadSession(
  actor: CurrentActor,
  input: CreateUploadSessionInput,
): Promise<{
  uploadSessionId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
  replayed: boolean;
}> {
  authorize(actor, "corpus.write");
  const mimeType = input.mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!(supportedUploadMimeTypes as readonly string[]).includes(mimeType)) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "This file type is not supported.",
      status: 422,
    });
  }

  const session = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.organization.id}:upload:${input.idempotencyKey}`}, 0))`,
      );
      const [existing] = await transaction
        .select({
          id: uploadSessions.id,
          declaredFilename: uploadSessions.declaredFilename,
          declaredMimeType: uploadSessions.declaredMimeType,
          declaredSize: uploadSessions.declaredSize,
          expiresAt: uploadSessions.expiresAt,
          storageObjectId: uploadSessions.storageObjectId,
          sha256: storageObjects.sha256,
          objectKey: storageObjects.objectKey,
          bucketAlias: storageObjects.bucketAlias,
          provider: storageObjects.provider,
        })
        .from(uploadSessions)
        .leftJoin(
          storageObjects,
          eq(storageObjects.id, uploadSessions.storageObjectId),
        )
        .where(eq(uploadSessions.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        if (
          existing.declaredFilename !== input.filename ||
          existing.declaredMimeType !== mimeType ||
          existing.declaredSize !== input.sizeBytes ||
          existing.sha256 !== input.sha256 ||
          !existing.storageObjectId ||
          !existing.objectKey ||
          !existing.bucketAlias ||
          !existing.provider
        ) {
          throw new AppError({
            code: "CONFLICT",
            message:
              "The idempotency key was already used with a different upload payload.",
            status: 409,
          });
        }
        return {
          id: existing.id,
          expiresAt: existing.expiresAt,
          object: {
            objectKey: existing.objectKey,
            bucketAlias: existing.bucketAlias,
            provider: existing.provider as "r2" | "minio",
          },
          replayed: true,
        };
      }

      const [settings] = await transaction
        .select({ maxUploadBytes: organizationSettings.maxUploadBytes })
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, actor.organization.id))
        .limit(1);
      if (!settings || input.sizeBytes > settings.maxUploadBytes)
        throw new AppError({
          code: "VALIDATION_FAILED",
          message: "The file exceeds the organization upload limit.",
          status: 422,
        });

      const location = workingStorageLocation();
      const object = {
        ...location,
        objectKey: `${actor.organization.id}/quarantine/${randomUUID()}`,
      };
      const [storage] = await transaction
        .insert(storageObjects)
        .values({
          organizationId: actor.organization.id,
          purpose: "quarantine",
          provider: object.provider,
          bucketAlias: object.bucketAlias,
          objectKey: object.objectKey,
          sha256: input.sha256,
          sizeBytes: input.sizeBytes,
          mimeType,
          originalFilename: input.filename,
          scanStatus: "pending",
        })
        .returning({ id: storageObjects.id });
      if (!storage)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Upload storage metadata could not be created.",
          status: 500,
        });
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const [created] = await transaction
        .insert(uploadSessions)
        .values({
          organizationId: actor.organization.id,
          requestedByMembershipId: actor.membership.id,
          declaredFilename: input.filename,
          declaredMimeType: mimeType,
          declaredSize: input.sizeBytes,
          storageObjectId: storage.id,
          expiresAt,
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: uploadSessions.id });
      if (!created)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Upload session could not be created.",
          status: 500,
        });
      return { id: created.id, expiresAt, object, replayed: false };
    },
  );

  const signed = await createQuarantineUploadUrl({
    objectKey: session.object.objectKey,
    mimeType,
    sha256: input.sha256,
  });
  return {
    uploadSessionId: session.id,
    expiresAt: session.expiresAt.toISOString(),
    replayed: session.replayed,
    ...signed,
  };
}

export async function completeUpload(
  actor: CurrentActor,
  input: CompleteUploadInput,
): Promise<{
  objectPath: string;
  documentVersionId: string;
  duplicate: boolean;
}> {
  authorize(actor, "corpus.write");
  const env = getServerEnv();
  if (!env.CURATED_DEMO_UPLOADS || !input.curatedDemoAcknowledged) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message:
        "File promotion requires the production malware scanner. For fictional hackathon files, an operator must explicitly enable curated demo uploads.",
      status: 503,
    });
  }

  const pending = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [row] = await transaction
        .select({
          id: uploadSessions.id,
          status: uploadSessions.status,
          expiresAt: uploadSessions.expiresAt,
          declaredFilename: uploadSessions.declaredFilename,
          declaredMimeType: uploadSessions.declaredMimeType,
          declaredSize: uploadSessions.declaredSize,
          storageObjectId: storageObjects.id,
          sha256: storageObjects.sha256,
          objectKey: storageObjects.objectKey,
          bucketAlias: storageObjects.bucketAlias,
          provider: storageObjects.provider,
        })
        .from(uploadSessions)
        .innerJoin(
          storageObjects,
          eq(storageObjects.id, uploadSessions.storageObjectId),
        )
        .where(
          and(
            eq(uploadSessions.id, input.uploadSessionId),
            eq(uploadSessions.requestedByMembershipId, actor.membership.id),
          ),
        )
        .limit(1);
      if (!row)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Upload session not found.",
          status: 404,
        });
      if (row.expiresAt <= new Date())
        throw new AppError({
          code: "CONFLICT",
          message: "The upload session expired. Start a new upload.",
          status: 409,
        });
      if (row.status === "completed")
        throw new AppError({
          code: "CONFLICT",
          message: "This upload was already completed.",
          status: 409,
        });
      if (row.status === "running")
        throw new AppError({
          code: "CONFLICT",
          message: "This upload is already being processed.",
          status: 409,
        });
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
      await transaction
        .update(uploadSessions)
        .set({ status: "running" })
        .where(eq(uploadSessions.id, row.id));
      return {
        ...row,
        object: {
          objectKey: row.objectKey,
          bucketAlias: row.bucketAlias,
          provider: row.provider as "r2" | "minio",
        },
      };
    },
  );

  let derivedObject: StoredObject | null = null;
  try {
    const bytes = await readWorkingObject(pending.object);
    if (
      bytes.byteLength !== pending.declaredSize ||
      sha256(bytes) !== pending.sha256
    ) {
      throw new AppError({
        code: "VALIDATION_FAILED",
        message:
          "The uploaded bytes do not match the declared size and SHA-256.",
        status: 422,
      });
    }
    const parsed = await parseDocument({
      bytes,
      filename: pending.declaredFilename,
      declaredMimeType: pending.declaredMimeType,
    });
    const contentSha256 = sha256(parsed.content);
    derivedObject = await putDerivedText({
      organizationId: actor.organization.id,
      documentHash: contentSha256,
      content: parsed.content,
    });

    const result = await withTenantContext(
      {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
      },
      async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.organization.id}:${contentSha256}:${parsed.parserName}:${parsed.parserVersion}`}, 0))`,
        );
        let [document] = await transaction
          .select({ id: documentVersions.id })
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.contentSha256, contentSha256),
              eq(documentVersions.parserName, parsed.parserName),
              eq(documentVersions.parserVersion, parsed.parserVersion),
            ),
          )
          .limit(1);
        const duplicate = Boolean(document);
        if (!document) {
          if (!derivedObject)
            throw new AppError({
              code: "INTERNAL_ERROR",
              message: "Derived storage state is inconsistent.",
              status: 500,
            });
          const [derivedStorage] = await transaction
            .insert(storageObjects)
            .values({
              organizationId: actor.organization.id,
              purpose: "derived_text",
              provider: derivedObject.provider,
              bucketAlias: derivedObject.bucketAlias,
              objectKey: derivedObject.objectKey,
              sha256: contentSha256,
              sizeBytes: Buffer.byteLength(parsed.content, "utf8"),
              mimeType: "text/plain; charset=utf-8",
              originalFilename: `${pending.declaredFilename}.txt`,
              scanStatus: "not_required_demo",
            })
            .returning({ id: storageObjects.id });
          if (!derivedStorage)
            throw new AppError({
              code: "INTERNAL_ERROR",
              message: "Derived storage metadata could not be created.",
              status: 500,
            });
          [document] = await transaction
            .insert(documentVersions)
            .values({
              organizationId: actor.organization.id,
              originalStorageObjectId: pending.storageObjectId,
              extractedTextStorageObjectId: derivedStorage.id,
              contentSha256,
              detectedMimeType: parsed.detectedMimeType,
              parserName: parsed.parserName,
              parserVersion: parsed.parserVersion,
              processingStatus: "completed",
              parserManifest: {
                ...parsed.manifest,
                ingestion: "upload",
                curatedDemoScanBypass: true,
              },
              processingWarnings: parsed.warnings,
              pageCount: parsed.pageCount,
              createdByMembershipId: actor.membership.id,
            })
            .returning({ id: documentVersions.id });
          if (!document)
            throw new AppError({
              code: "INTERNAL_ERROR",
              message: "Document version could not be created.",
              status: 500,
            });
          const chunks = chunkText(parsed.content);
          if (chunks.length > 0) {
            await transaction.insert(documentChunks).values(
              chunks.map((chunk) => ({
                organizationId: actor.organization.id,
                documentVersionId: document!.id,
                ...chunk,
                location: { ingestion: "upload" },
              })),
            );
            await transaction.execute(
              sql`update document_chunk set search_vector = to_tsvector('english', content) where document_version_id = ${document.id}`,
            );
          }
        }
        if (!document)
          throw new AppError({
            code: "INTERNAL_ERROR",
            message: "Document processing returned no record.",
            status: 500,
          });
        await transaction
          .update(storageObjects)
          .set({
            purpose: duplicate ? "quarantine" : "working_original",
            scanStatus: duplicate ? "rejected" : "not_required_demo",
          })
          .where(eq(storageObjects.id, pending.storageObjectId));
        await transaction
          .update(uploadSessions)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(uploadSessions.id, pending.id));
        const governed = await persistGovernedObject(
          transaction,
          actor,
          input,
          document.id,
          contentSha256,
        );
        return {
          objectPath: governed.objectPath,
          documentVersionId: document.id,
          duplicate,
        };
      },
    );
    if (result.duplicate && derivedObject)
      await deleteWorkingObject(derivedObject);
    if (result.duplicate) await deleteWorkingObject(pending.object);
    return result;
  } catch (error) {
    if (derivedObject) await deleteWorkingObject(derivedObject);
    await withTenantContext(
      {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
      },
      async (transaction) => {
        await transaction
          .update(uploadSessions)
          .set({ status: "failed" })
          .where(eq(uploadSessions.id, pending.id));
        await transaction
          .update(storageObjects)
          .set({ scanStatus: "failed" })
          .where(eq(storageObjects.id, pending.storageObjectId));
      },
    );
    throw error;
  }
}
