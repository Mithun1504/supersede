import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { governedTaskRequestSchema } from "@/ai/workflows/api";
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
import { problemDetailsSchema } from "@/lib/api/problem-details";
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

export function registerOpenApiSchemas(registry: OpenAPIRegistry) {
  registry.register("ProblemDetails", problemDetailsSchema);
  registry.register("ExtractionRequest", extractionApiRequestSchema);
  registry.register("ExtractionResponse", extractionApiResponseSchema);
  registry.register("CorpusUploadSignRequest", signCorpusUploadRequestSchema);
  registry.register("CorpusUploadSignResponse", signCorpusUploadResponseSchema);
  registry.register("CorpusUploadParseRequest", parseCorpusUploadRequestSchema);
  registry.register("ParsedCorpusUpload", parsedCorpusUploadSchema);
  registry.register("GovernedAiTaskRequest", governedTaskRequestSchema);
  registry.register("SubmitChangeRequest", submitChangeRequestSchema);
  registry.register("SubmitChangeResponse", submitChangeResponseSchema);
  registry.register("ValidateChangeRequest", validateChangeRequestSchema);
  registry.register("ValidateChangeResponse", validateChangeResponseSchema);
  registry.register("DraftCaseRequest", draftCaseRequestSchema);
  registry.register("DraftCaseResponse", draftCaseResponseSchema);
  registry.register("ApproveCaseRequest", approveCaseRequestSchema);
  registry.register("ApproveCaseResponse", approveCaseResponseSchema);
  registry.register("AcceptEdgeRequest", acceptEdgeRequestSchema);
  registry.register("AcceptEdgeResponse", acceptEdgeResponseSchema);
  registry.register("OverrideEdgeRequest", overrideEdgeRequestSchema);
  registry.register("OverrideEdgeResponse", overrideEdgeResponseSchema);
  registry.register("RetireCaseRequest", retireCaseRequestSchema);
  registry.register("RetireCaseResponse", retireCaseResponseSchema);
  registry.register("ReleaseCaseRequest", releaseCaseRequestSchema);
  registry.register("ReleaseCaseResponse", releaseCaseResponseSchema);
  registry.register("OpenProbeRequest", openProbeRequestSchema);
  registry.register("OpenProbeResponse", openProbeResponseSchema);
  registry.register("CompleteProbeRequest", completeProbeRequestSchema);
  registry.register("CompleteProbeResponse", completeProbeResponseSchema);
  registry.register(
    "CompleteRemediationRequest",
    completeRemediationRequestSchema,
  );
  registry.register(
    "CompleteRemediationResponse",
    completeRemediationRouteResponseSchema,
  );
  registry.register("TriageArtifactRequest", triageArtifactRequestSchema);
  registry.register("TriageArtifactResponse", triageArtifactResponseSchema);
  registry.register(
    "AssignArtifactOwnerRequest",
    assignArtifactOwnerRequestSchema,
  );
  registry.register(
    "AssignArtifactOwnerResponse",
    assignArtifactOwnerResponseSchema,
  );
  registry.register(
    "SubmitCorrectedArtifactVersionRequest",
    submitCorrectedArtifactVersionRequestSchema,
  );
  registry.register(
    "SubmitCorrectedArtifactVersionResponse",
    submitCorrectedArtifactVersionResponseSchema,
  );
  registry.register(
    "ApproveArtifactVersionRequest",
    approveArtifactVersionRequestSchema,
  );
  registry.register(
    "ApproveArtifactVersionResponse",
    approveArtifactVersionResponseSchema,
  );
  registry.register(
    "PublishArtifactVersionRequest",
    publishArtifactVersionRequestSchema,
  );
  registry.register(
    "PublishArtifactVersionResponse",
    publishArtifactVersionResponseSchema,
  );
  registry.register("ExportReleaseRequest", exportReleaseRequestSchema);
  registry.register("ExportReleaseResponse", exportReleaseResponseSchema);
  registry.register("RetentionChangeRequest", retentionChangeRequestSchema);
  registry.register("RetentionChangeResponse", retentionChangeResponseSchema);
}
