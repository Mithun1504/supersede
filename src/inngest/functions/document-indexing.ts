import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { artifacts, artifactVersions, auditEvents } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { inngest } from "@/inngest/client";
import { indexArtifactVersion } from "@/modules/corpus";
import { extractClaimsFromPastedText } from "@/modules/corpus/extraction";
import { persistExtractedClaims } from "@/modules/corpus/persistence";
import {
  beginWorkflow,
  finishWorkflow,
  recordWorkflowStep,
} from "@/modules/workflows";

const payloadSchema = z.object({
  organizationId: z.string().uuid(),
  actorMembershipId: z.string().uuid(),
  artifactVersionId: z.string().uuid(),
  artifactId: z.string().uuid(),
  outboxEventId: z.string().uuid(),
});

export const documentIndexing = inngest.createFunction(
  {
    id: "document-ingestion-and-indexing-v1",
    name: "Chunk and index an ingested document",
    triggers: { event: "document.ingested" },
    retries: 5,
    concurrency: { limit: 2, key: "event.data.organizationId" },
  },
  async ({ event, step, runId }) => {
    const payload = payloadSchema.parse(event.data);
    const actor = {
      organizationId: payload.organizationId,
      actorMembershipId: payload.actorMembershipId,
    };
    const workflowRunId = await step.run("project-workflow-start", () =>
      beginWorkflow(actor, {
        externalRunId: runId,
        workflowName: "document-ingestion",
        subjectType: "artifact_version",
        subjectId: payload.artifactVersionId,
        totalSteps: 3,
      }),
    );
    try {
      const document = await step.run("load-document", async () => {
        const result = await withTenantContext(actor, (transaction) =>
          transaction
            .select({
              title: artifacts.title,
              text: artifactVersions.bodyText,
              fileSha256: artifactVersions.fileSha256,
            })
            .from(artifactVersions)
            .innerJoin(artifacts, eq(artifacts.id, artifactVersions.artifactId))
            .where(
              and(
                eq(artifactVersions.organizationId, actor.organizationId),
                eq(artifactVersions.id, payload.artifactVersionId),
              ),
            )
            .limit(1),
        );
        const row = result[0];
        if (!row) throw new Error("Ingested artifact version was not found.");
        await recordWorkflowStep(actor, {
          workflowRunId,
          stepKey: "load",
          label: "Load parsed document version",
          status: "completed",
        });
        return row;
      });
      const indexed = await step.run("chunk-and-embed", async () => {
        const result = await indexArtifactVersion(actor, {
          artifactVersionId: payload.artifactVersionId,
          title: document.title,
          text: document.text,
        });
        await recordWorkflowStep(actor, {
          workflowRunId,
          stepKey: "index",
          label: "Chunk, embed, and index",
          status: "completed",
          detail: result,
        });
        return result;
      });
      const extraction = await step.run(
        "extract-verify-and-queue",
        async () => {
          const existing = await withTenantContext(actor, (transaction) =>
            transaction
              .select({ id: auditEvents.id })
              .from(auditEvents)
              .where(
                and(
                  eq(auditEvents.organizationId, actor.organizationId),
                  eq(auditEvents.objectVersionId, payload.artifactVersionId),
                  eq(auditEvents.eventType, "corpus.claims_extracted"),
                ),
              )
              .limit(1),
          );
          if (existing.length) {
            await recordWorkflowStep(actor, {
              workflowRunId,
              stepKey: "extract",
              label: "Verify extracted quotes and queue reviews",
              status: "completed",
              detail: { reusedRequestResult: true },
            });
            return { reusedRequestResult: true };
          }

          const sourceHash = `sha256:${document.fileSha256}`;
          const result = await extractClaimsFromPastedText(
            {
              documentVersionId: payload.artifactVersionId,
              sourceHash,
              text: document.text,
              executionMode: "live",
            },
            { idempotencyKey: payload.outboxEventId },
          );
          const persisted = await persistExtractedClaims(actor, {
            artifactId: payload.artifactId,
            artifactVersionId: payload.artifactVersionId,
            sourceHash,
            result,
          });
          await recordWorkflowStep(actor, {
            workflowRunId,
            stepKey: "extract",
            label: "Verify extracted quotes and queue reviews",
            status: "completed",
            detail: persisted,
          });
          return persisted;
        },
      );
      await step.run("project-workflow-complete", () =>
        finishWorkflow(actor, workflowRunId),
      );
      return { indexed, extraction };
    } catch (error) {
      await finishWorkflow(actor, workflowRunId, error);
      throw error;
    }
  },
);
