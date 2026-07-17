import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  approveCaseRequestSchema,
  approveCaseResponseSchema,
} from "@/app/api/v1/workflow/cases/[caseId]/versions/[caseVersionId]/approve/route";
import {
  releaseCaseRequestSchema,
  releaseCaseResponseSchema,
} from "@/app/api/v1/workflow/cases/[caseId]/versions/[caseVersionId]/release/route";
import {
  retireCaseRequestSchema,
  retireCaseResponseSchema,
} from "@/app/api/v1/workflow/cases/[caseId]/versions/[caseVersionId]/retire/route";
import {
  draftCaseRequestSchema,
  draftCaseResponseSchema,
} from "@/app/api/v1/workflow/cases/route";
import {
  validateChangeRequestSchema,
  validateChangeResponseSchema,
} from "@/app/api/v1/workflow/changes/[changeEventId]/versions/[changeEventVersionId]/validate/route";
import {
  submitChangeRequestSchema,
  submitChangeResponseSchema,
} from "@/app/api/v1/workflow/changes/route";
import {
  acceptEdgeRequestSchema,
  acceptEdgeResponseSchema,
} from "@/app/api/v1/workflow/edges/[edgeId]/versions/[edgeVersionId]/accept/route";
import {
  overrideEdgeRequestSchema,
  overrideEdgeResponseSchema,
} from "@/app/api/v1/workflow/edges/[edgeId]/versions/[edgeVersionId]/override/route";
import {
  completeProbeRequestSchema,
  completeProbeResponseSchema,
} from "@/app/api/v1/workflow/probes/[probeAssignmentId]/complete/route";
import {
  openProbeRequestSchema,
  openProbeResponseSchema,
} from "@/app/api/v1/workflow/probes/[probeAssignmentId]/open/route";
import {
  completeRemediationRequestSchema,
  completeRemediationRouteResponseSchema,
} from "@/app/api/v1/workflow/remediations/[remediationAssignmentId]/complete/route";
import { idempotencyHeader, mutationProblems } from "@/lib/api/openapi/shared";

const changeVersionParams = z.object({
  changeEventId: z.string().uuid(),
  changeEventVersionId: z.string().uuid(),
});
const caseVersionParams = z.object({
  caseId: z.string().uuid(),
  caseVersionId: z.string().uuid(),
});
const edgeVersionParams = z.object({
  edgeId: z.string().uuid(),
  edgeVersionId: z.string().uuid(),
});
const probeAssignmentParams = z.object({
  probeAssignmentId: z.string().uuid(),
});

export function registerWorkflowPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/changes",
    summary: "Submit a governed ChangeEvent draft",
    tags: ["Workflow"],
    request: {
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: submitChangeRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Submitted ChangeEvent and mutable version identifiers.",
        content: {
          "application/json": { schema: submitChangeResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/changes/{changeEventId}/versions/{changeEventVersionId}/validate",
    summary: "Validate and lock a governed ChangeEvent version",
    tags: ["Workflow"],
    request: {
      params: changeVersionParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: validateChangeRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Validated ChangeEvent identifiers.",
        content: {
          "application/json": { schema: validateChangeResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/cases",
    summary: "Draft a governed divergence case version",
    tags: ["Workflow"],
    request: {
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: draftCaseRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Drafted divergence case identifiers.",
        content: {
          "application/json": { schema: draftCaseResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/cases/{caseId}/versions/{caseVersionId}/approve",
    summary: "Approve a governed divergence case version",
    tags: ["Workflow"],
    request: {
      params: caseVersionParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: approveCaseRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Approved divergence case identifiers.",
        content: {
          "application/json": { schema: approveCaseResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/edges/{edgeId}/versions/{edgeVersionId}/accept",
    summary: "Accept and lock a reviewed dependency edge version",
    tags: ["Workflow"],
    request: {
      params: edgeVersionParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: acceptEdgeRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description:
          "Reviewed edge with retained AI confidence, rationale, and impact classification.",
        content: {
          "application/json": { schema: acceptEdgeResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/edges/{edgeId}/versions/{edgeVersionId}/override",
    summary: "Override and lock a reviewed dependency edge classification",
    tags: ["Workflow"],
    request: {
      params: edgeVersionParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: overrideEdgeRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description:
          "Reviewed edge with retained AI confidence, rationale, and audited override reason.",
        content: {
          "application/json": { schema: overrideEdgeResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/cases/{caseId}/versions/{caseVersionId}/retire",
    summary: "Retire an approved divergence case version",
    tags: ["Workflow"],
    request: {
      params: caseVersionParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: retireCaseRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Retired divergence case identifiers.",
        content: {
          "application/json": { schema: retireCaseResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/cases/{caseId}/versions/{caseVersionId}/release",
    summary: "Authorize release for an approved divergence case version",
    tags: ["Workflow"],
    request: {
      params: caseVersionParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: releaseCaseRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Release-authorized divergence case identifiers.",
        content: {
          "application/json": { schema: releaseCaseResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/probes/{probeAssignmentId}/open",
    summary: "Record an assigned probe as opened",
    tags: ["Workflow"],
    request: {
      params: probeAssignmentParams,
      headers: idempotencyHeader,
      body: {
        content: { "application/json": { schema: openProbeRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Opened probe assignment status.",
        content: { "application/json": { schema: openProbeResponseSchema } },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/probes/{probeAssignmentId}/complete",
    summary: "Complete and assess an assigned probe response",
    tags: ["Workflow"],
    request: {
      params: probeAssignmentParams,
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: completeProbeRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Governed probe assessment and remediation routing.",
        content: {
          "application/json": { schema: completeProbeResponseSchema },
        },
      },
      ...mutationProblems,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/workflow/remediations/{remediationAssignmentId}/complete",
    summary: "Complete an assigned remediation",
    tags: ["Workflow"],
    request: {
      params: z.object({ remediationAssignmentId: z.string().uuid() }),
      headers: idempotencyHeader,
      body: {
        content: {
          "application/json": { schema: completeRemediationRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Completed remediation assignment status.",
        content: {
          "application/json": {
            schema: completeRemediationRouteResponseSchema,
          },
        },
      },
      ...mutationProblems,
    },
  });
}
