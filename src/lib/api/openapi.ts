import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { healthResponseSchema } from "@/app/api/v1/health/route";
import { problemDetailsSchema } from "@/lib/api/problem-details";
import {
  completeUploadBodyInput,
  completeUploadResponse,
  createUploadSessionInput,
  uploadSessionResponse,
} from "@/modules/corpus/contracts";

extendZodWithOpenApi(z);

export function createOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.register("ProblemDetails", problemDetailsSchema);
  registry.register("CreateUploadSession", createUploadSessionInput);
  registry.register("UploadSession", uploadSessionResponse);
  registry.register("CompleteUpload", completeUploadBodyInput);
  registry.register("CompletedUpload", completeUploadResponse);
  registry.registerPath({
    method: "get",
    path: "/api/v1/health",
    summary: "Report application liveness and provider configuration",
    tags: ["System"],
    responses: {
      200: {
        description: "Application is running.",
        content: {
          "application/json": { schema: healthResponseSchema },
        },
      },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/workflows/{workflowRunId}/events",
    summary: "Stream an authorized durable workflow projection",
    tags: ["Operations"],
    request: { params: z.object({ workflowRunId: z.string().uuid() }) },
    responses: {
      200: {
        description:
          "A bounded text/event-stream; reconnect to continue following an active run.",
        content: { "text/event-stream": { schema: z.string() } },
      },
      404: { description: "The workflow is absent or inaccessible." },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/integrations/xapi",
    summary:
      "Export current learner assessment revisions as xAPI 1.0.3 statements",
    tags: ["Integrations"],
    responses: {
      200: {
        description: "A JSON attachment containing xAPI statements.",
        content: {
          "application/json": {
            schema: z.array(
              z.object({
                id: z.string().uuid(),
                actor: z.object({
                  objectType: z.literal("Agent"),
                  mbox: z.string(),
                }),
                verb: z.object({ id: z.string().url() }),
                object: z.object({
                  id: z.string(),
                  objectType: z.literal("Activity"),
                }),
                timestamp: z.string().datetime(),
              }),
            ),
          },
        },
      },
      403: {
        description: "The caller is unauthorized or the origin check failed.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/reports/{reportBundleId}/download",
    summary: "Create a short-lived redirect to a completed evidence bundle",
    tags: ["Reports"],
    request: { params: z.object({ reportBundleId: z.string().uuid() }) },
    responses: {
      303: { description: "Redirect to a private, short-lived object URL." },
      404: {
        description: "The bundle is absent, incomplete, or inaccessible.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/uploads",
    summary: "Create a direct-to-object-storage upload session",
    tags: ["Corpus"],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: createUploadSessionInput } },
      },
    },
    responses: {
      201: {
        description: "A signed upload session was created.",
        content: { "application/json": { schema: uploadSessionResponse } },
      },
      422: {
        description: "The upload request is invalid.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/uploads/{uploadSessionId}/complete",
    summary: "Verify, parse, and add an uploaded document to a corpus",
    tags: ["Corpus"],
    request: {
      params: z.object({ uploadSessionId: z.string().uuid() }),
      body: {
        required: true,
        content: { "application/json": { schema: completeUploadBodyInput } },
      },
    },
    responses: {
      200: {
        description: "The uploaded document was processed.",
        content: { "application/json": { schema: completeUploadResponse } },
      },
      422: {
        description: "The uploaded object or metadata is invalid.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Supersede API",
      version: "0.1.0",
      description: "Versioned REST contracts for Supersede integrations.",
    },
    servers: [{ url: "/" }],
  });
}
