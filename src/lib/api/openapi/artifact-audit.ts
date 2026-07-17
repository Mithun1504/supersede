import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  exportReleaseRequestSchema,
  exportReleaseResponseSchema,
} from "@/app/api/v1/exports/report-bundles/[reportBundleId]/release/route";
import {
  retentionChangeRequestSchema,
  retentionChangeResponseSchema,
} from "@/app/api/v1/exports/report-bundles/[reportBundleId]/retention/route";
import {
  assignArtifactOwnerRequestSchema,
  assignArtifactOwnerResponseSchema,
} from "@/app/api/v1/workflow/artifacts/[artifactId]/assign-owner/route";
import {
  approveArtifactVersionRequestSchema,
  approveArtifactVersionResponseSchema,
} from "@/app/api/v1/workflow/artifacts/[artifactId]/versions/[artifactVersionId]/approve/route";
import {
  publishArtifactVersionRequestSchema,
  publishArtifactVersionResponseSchema,
} from "@/app/api/v1/workflow/artifacts/[artifactId]/versions/[artifactVersionId]/publish/route";
import {
  submitCorrectedArtifactVersionRequestSchema,
  submitCorrectedArtifactVersionResponseSchema,
} from "@/app/api/v1/workflow/artifacts/[artifactId]/versions/route";
import {
  triageArtifactRequestSchema,
  triageArtifactResponseSchema,
} from "@/app/api/v1/workflow/artifacts/[artifactId]/triage/route";
import { idempotencyHeader, mutationProblems } from "@/lib/api/openapi/shared";

const artifactParams = z.object({ artifactId: z.string().uuid() });
const artifactVersionParams = z.object({
  artifactId: z.string().uuid(),
  artifactVersionId: z.string().uuid(),
});
const reportBundleParams = z.object({
  reportBundleId: z.string().uuid(),
});

export function registerArtifactAndAuditPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/artifacts/{artifactId}/triage",
    summary: "Triage an impacted artifact version",
    tags: ["Workflow"],
    request: {
      params: artifactParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: triageArtifactRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Triaged artifact version identifiers.",
        content: {
          "application/json": { schema: triageArtifactResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/artifacts/{artifactId}/assign-owner",
    summary: "Assign a governed artifact owner",
    tags: ["Workflow"],
    request: {
      params: artifactParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: assignArtifactOwnerRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Artifact owner assignment identifier.",
        content: {
          "application/json": { schema: assignArtifactOwnerResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/artifacts/{artifactId}/versions",
    summary: "Submit a corrected governed artifact version",
    tags: ["Workflow"],
    request: {
      params: artifactParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": {
            schema: submitCorrectedArtifactVersionRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Submitted corrected artifact version identifiers.",
        content: {
          "application/json": {
            schema: submitCorrectedArtifactVersionResponseSchema,
          },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/artifacts/{artifactId}/versions/{artifactVersionId}/approve",
    summary: "Approve and lock a governed artifact version",
    tags: ["Workflow"],
    request: {
      params: artifactVersionParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: approveArtifactVersionRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Approved artifact version identifiers.",
        content: {
          "application/json": { schema: approveArtifactVersionResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/artifacts/{artifactId}/versions/{artifactVersionId}/publish",
    summary: "Publish an approved locked artifact version",
    tags: ["Workflow"],
    request: {
      params: artifactVersionParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: publishArtifactVersionRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Published artifact version identifiers.",
        content: {
          "application/json": { schema: publishArtifactVersionResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/exports/report-bundles/{reportBundleId}/release",
    summary: "Authorize audit export release",
    tags: ["Audit"],
    request: {
      params: reportBundleParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: exportReleaseRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Export release approval.",
        content: {
          "application/json": { schema: exportReleaseResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/exports/report-bundles/{reportBundleId}/retention",
    summary: "Approve an audit export retention change",
    tags: ["Audit"],
    request: {
      params: reportBundleParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: retentionChangeRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description:
          "Retention change approval with explicit standard versus WORM mode.",
        content: {
          "application/json": { schema: retentionChangeResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
}
