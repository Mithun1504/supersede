import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { governedTaskRequestSchema } from "@/ai/workflows/api";
import { healthResponseSchema } from "@/app/api/v1/health/route";
import { readinessResponseSchema } from "@/app/api/v1/readiness/route";
import { problemDetailsSchema } from "@/lib/api/problem-details";
import {
  hybridRetrievalRequestSchema,
  hybridRetrievalResponseSchema,
} from "@/modules/corpus";
import {
  extractionApiRequestSchema,
  extractionApiResponseSchema,
} from "@/modules/corpus/extraction";
import {
  parsedCorpusUploadSchema,
  parseCorpusUploadRequestSchema,
  signCorpusUploadRequestSchema,
  signCorpusUploadResponseSchema,
} from "@/modules/corpus/uploads";

export function registerSystemAiAndCorpusPaths(registry: OpenAPIRegistry) {
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
    method: "post",
    path: "/api/v1/retrieval",
    summary: "Retrieve tenant-scoped approved evidence chunks",
    tags: ["Corpus"],
    request: {
      body: {
        content: {
          "application/json": { schema: hybridRetrievalRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description:
          "Hybrid semantic and lexical results after tenant and version-lock filters.",
        content: {
          "application/json": { schema: hybridRetrievalResponseSchema },
        },
      },
      401: {
        description: "Authentication is required.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
      503: {
        description: "The configured embedding provider is unavailable.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/ai/tasks",
    summary: "Run an authenticated governed GPT-5.6 task",
    tags: ["AI"],
    request: {
      headers: z.object({ "Idempotency-Key": z.string().min(1) }),
      body: {
        content: {
          "application/json": { schema: governedTaskRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description:
          "Evidence-checked model proposal with provenance. No response is an approval.",
      },
      401: {
        description: "Authentication is required.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
      422: {
        description: "The task input failed validation.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/readiness",
    summary: "Verify critical production dependencies",
    tags: ["System"],
    responses: {
      200: {
        description: "Critical dependencies are configured and reachable.",
        content: { "application/json": { schema: readinessResponseSchema } },
      },
      503: {
        description: "At least one critical dependency is unavailable.",
        content: { "application/json": { schema: readinessResponseSchema } },
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/extractions",
    summary: "Run live governed claim extraction for pasted text",
    tags: ["AI"],
    request: {
      headers: z.object({ "Idempotency-Key": z.string().min(1) }),
      body: {
        content: {
          "application/json": { schema: extractionApiRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description:
          "Claims extracted from pasted text. Suggested claims are still not approved.",
        content: {
          "application/json": { schema: extractionApiResponseSchema },
        },
      },
      400: {
        description: "Missing idempotency key or malformed JSON.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
      401: {
        description: "Authentication is required.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
      403: {
        description: "Authenticated actor is not scoped to a tenant.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
      422: {
        description: "Request body failed validation.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/uploads/sign",
    summary: "Create a tenant-scoped direct upload URL",
    tags: ["Corpus"],
    request: {
      body: {
        content: {
          "application/json": { schema: signCorpusUploadRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Short-lived private object-storage upload URL.",
        content: {
          "application/json": { schema: signCorpusUploadResponseSchema },
        },
      },
      401: {
        description: "Authentication is required.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
      422: {
        description: "File metadata is unsupported or exceeds 25 MB.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/uploads/parse",
    summary: "Validate and parse an uploaded corpus object",
    tags: ["Corpus"],
    request: {
      body: {
        content: {
          "application/json": { schema: parseCorpusUploadRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Verified document metadata and extracted text.",
        content: {
          "application/json": { schema: parsedCorpusUploadSchema },
        },
      },
      422: {
        description:
          "The upload is invalid, unsupported, or requires unavailable OCR.",
        content: {
          "application/problem+json": { schema: problemDetailsSchema },
        },
      },
    },
  });
}
