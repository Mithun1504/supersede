import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as approveCase } from "@/app/api/v1/workflow/cases/[caseId]/versions/[caseVersionId]/approve/route";
import { POST as releaseCase } from "@/app/api/v1/workflow/cases/[caseId]/versions/[caseVersionId]/release/route";
import { POST as retireCase } from "@/app/api/v1/workflow/cases/[caseId]/versions/[caseVersionId]/retire/route";
import { POST as draftCase } from "@/app/api/v1/workflow/cases/route";
import { POST as validateChange } from "@/app/api/v1/workflow/changes/[changeEventId]/versions/[changeEventVersionId]/validate/route";
import { POST as submitChange } from "@/app/api/v1/workflow/changes/route";
import { POST as acceptEdge } from "@/app/api/v1/workflow/edges/[edgeId]/versions/[edgeVersionId]/accept/route";
import { POST as overrideEdge } from "@/app/api/v1/workflow/edges/[edgeId]/versions/[edgeVersionId]/override/route";
import { POST as completeRemediationRoute } from "@/app/api/v1/workflow/remediations/[remediationAssignmentId]/complete/route";
import { AppError } from "@/lib/errors/app-error";
import {
  approveCaseVersion,
  authorizeCaseRelease,
  draftCaseVersion,
  retireCaseVersion,
} from "@/modules/cases";
import { enterChangeEvent, validateChangeEvent } from "@/modules/changes";
import { acceptDependencyEdge, overrideDependencyEdge } from "@/modules/graph";
import {
  requireRequestAuthentication,
  requireTenantActor,
} from "@/modules/identity/request-context";
import { completeRemediation } from "@/modules/learning";

vi.mock("@/modules/identity/request-context", () => ({
  requireRequestAuthentication: vi.fn(),
  requireTenantActor: vi.fn(),
}));

vi.mock("@/modules/changes", () => ({
  enterChangeEvent: vi.fn(),
  validateChangeEvent: vi.fn(),
}));

vi.mock("@/modules/cases", () => ({
  approveCaseVersion: vi.fn(),
  authorizeCaseRelease: vi.fn(),
  draftCaseVersion: vi.fn(),
  retireCaseVersion: vi.fn(),
}));

vi.mock("@/modules/graph", () => ({
  acceptDependencyEdge: vi.fn(),
  overrideDependencyEdge: vi.fn(),
}));

vi.mock("@/modules/learning", () => ({
  completeRemediation: vi.fn(),
}));

const tenant = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  actorMembershipId: "00000000-0000-4000-8000-000000000002",
};
const auth = {
  workosUserId: "user_123",
  workosOrganizationId: "org_123",
  email: "reviewer@example.com",
  displayName: "Reviewer",
};
const changeEventId = "00000000-0000-4000-8000-000000000011";
const changeEventVersionId = "00000000-0000-4000-8000-000000000012";
const caseId = "00000000-0000-4000-8000-000000000021";
const caseVersionId = "00000000-0000-4000-8000-000000000022";
const edgeId = "00000000-0000-4000-8000-000000000041";
const edgeVersionId = "00000000-0000-4000-8000-000000000042";
const remediationAssignmentId = "00000000-0000-4000-8000-000000000031";
const edgeReviewResult = {
  edgeId,
  edgeVersionId,
  reviewStatus: "reviewed" as const,
  decision: "accepted" as const,
  ai: {
    confidence: 0.91,
    rationale: "The model found a direct dependency in the quoted span.",
    loadBearingScore: 0.7,
  },
  impact: { class: "rewrite_required" as const, humanReviewed: true as const },
};

describe("workflow mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRequestAuthentication).mockResolvedValue(auth);
    vi.mocked(requireTenantActor).mockResolvedValue({ tenant, auth });
    vi.mocked(enterChangeEvent).mockResolvedValue({
      changeEventId,
      changeEventVersionId,
    });
    vi.mocked(validateChangeEvent).mockResolvedValue({
      changeEventId,
      changeEventVersionId,
    });
    vi.mocked(draftCaseVersion).mockResolvedValue({ caseId, caseVersionId });
    vi.mocked(approveCaseVersion).mockResolvedValue({ caseId, caseVersionId });
    vi.mocked(retireCaseVersion).mockResolvedValue({ caseId, caseVersionId });
    vi.mocked(authorizeCaseRelease).mockResolvedValue({
      caseId,
      caseVersionId,
    });
    vi.mocked(acceptDependencyEdge).mockResolvedValue(edgeReviewResult);
    vi.mocked(overrideDependencyEdge).mockResolvedValue({
      ...edgeReviewResult,
      decision: "overridden",
      impact: {
        class: "line_edit",
        humanReviewed: true,
        overrideClass: "peripheral",
        overrideReason: "The edge is informative but not load-bearing.",
      },
    });
    vi.mocked(completeRemediation).mockResolvedValue({
      remediationAssignmentId,
      passed: true,
    });
  });

  it("authenticates before exposing workflow validation details", async () => {
    vi.mocked(requireRequestAuthentication).mockRejectedValueOnce(
      new AppError({
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
        status: 401,
      }),
    );

    const response = await submitChange(
      new Request("http://localhost/api/v1/workflow/changes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("submits a change with a validated body and header idempotency key", async () => {
    const response = await submitChange(
      request("/api/v1/workflow/changes", submitChangeBody(), {
        "Idempotency-Key": "idem-change-submit",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toBe("idem-change-submit");
    expect(enterChangeEvent).toHaveBeenCalledWith(tenant, {
      ...submitChangeBody(),
      idempotencyKey: "idem-change-submit",
    });
  });

  it("accepts body idempotency when the header is absent", async () => {
    const response = await approveCase(
      request("/api/v1/workflow/cases/c/versions/v/approve", {
        idempotencyKey: "idem-case-approve",
      }),
      caseParams(),
    );

    expect(response.status).toBe(200);
    expect(approveCaseVersion).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-case-approve",
      caseId,
      caseVersionId,
    });
  });

  it("rejects missing or conflicting idempotency before calling services", async () => {
    const missing = await submitChange(
      request("/api/v1/workflow/changes", submitChangeBody()),
    );
    const conflicting = await submitChange(
      request(
        "/api/v1/workflow/changes",
        { ...submitChangeBody(), idempotencyKey: "idem-body-key" },
        { "Idempotency-Key": "idem-header-key" },
      ),
    );

    expect(missing.status).toBe(400);
    expect(conflicting.status).toBe(400);
    expect(enterChangeEvent).not.toHaveBeenCalled();
  });

  it("validates path UUIDs at the route boundary", async () => {
    const response = await validateChange(
      request(
        "/api/v1/workflow/changes/not-a-uuid/versions/v/validate",
        {},
        { "Idempotency-Key": "idem-validate" },
      ),
      {
        params: Promise.resolve({
          changeEventId: "not-a-uuid",
          changeEventVersionId,
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(validateChangeEvent).not.toHaveBeenCalled();
  });

  it("routes each governed action to its existing transactional service", async () => {
    await validateChange(
      request("/validate", {}, { "Idempotency-Key": "idem-change-validate" }),
      changeParams(),
    );
    await draftCase(
      request("/api/v1/workflow/cases", draftCaseBody(), {
        "Idempotency-Key": "idem-case-draft",
      }),
    );
    await retireCase(
      request(
        "/retire",
        { reason: "superseded by newer evidence" },
        { "Idempotency-Key": "idem-case-retire" },
      ),
      caseParams(),
    );
    await releaseCase(
      request("/release", {}, { "Idempotency-Key": "idem-case-release" }),
      caseParams(),
    );
    await acceptEdge(
      request(
        "/accept",
        {
          aiRationale: "The model found a direct dependency.",
          loadBearingScore: 0.7,
        },
        { "Idempotency-Key": "idem-edge-accept" },
      ),
      edgeParams(),
    );
    await overrideEdge(
      request(
        "/override",
        {
          aiRationale: "The model over-weighted a mention.",
          loadBearingScore: 0.9,
          overrideClass: "peripheral",
          reason: "The downstream artifact still works unchanged.",
        },
        { "Idempotency-Key": "idem-edge-override" },
      ),
      edgeParams(),
    );
    await completeRemediationRoute(
      request(
        "/complete",
        {
          submittedPatch: "Updated the workflow.",
          feedback: "Looks correct.",
          passed: true,
        },
        { "Idempotency-Key": "idem-remediation" },
      ),
      { params: Promise.resolve({ remediationAssignmentId }) },
    );

    expect(validateChangeEvent).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-change-validate",
      changeEventId,
      changeEventVersionId,
    });
    expect(draftCaseVersion).toHaveBeenCalledWith(tenant, {
      ...draftCaseBody(),
      idempotencyKey: "idem-case-draft",
    });
    expect(retireCaseVersion).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-case-retire",
      caseId,
      caseVersionId,
      reason: "superseded by newer evidence",
    });
    expect(authorizeCaseRelease).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-case-release",
      caseId,
      caseVersionId,
    });
    expect(acceptDependencyEdge).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-edge-accept",
      edgeId,
      edgeVersionId,
      aiRationale: "The model found a direct dependency.",
      loadBearingScore: 0.7,
    });
    expect(overrideDependencyEdge).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-edge-override",
      edgeId,
      edgeVersionId,
      aiRationale: "The model over-weighted a mention.",
      loadBearingScore: 0.9,
      overrideClass: "peripheral",
      reason: "The downstream artifact still works unchanged.",
    });
    expect(completeRemediation).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-remediation",
      remediationAssignmentId,
      submittedPatch: "Updated the workflow.",
      feedback: "Looks correct.",
      passed: true,
    });
  });

  it("preserves service authorization and conflict errors as problem details", async () => {
    vi.mocked(authorizeCaseRelease).mockRejectedValueOnce(
      new AppError({
        code: "CONFLICT",
        message: "Only an approved, unambiguous case can be released.",
        status: 409,
      }),
    );

    const response = await releaseCase(
      request("/release", {}, { "Idempotency-Key": "idem-case-release" }),
      caseParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "CONFLICT",
      title: "Only an approved, unambiguous case can be released.",
    });
  });

  it("returns retained AI confidence and rationale for reviewed edges", async () => {
    const response = await acceptEdge(
      request(
        "/accept",
        {
          aiRationale: "The model found a direct dependency in the quote.",
          loadBearingScore: 0.7,
        },
        { "Idempotency-Key": "idem-edge-accept" },
      ),
      edgeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ai).toMatchObject({
      confidence: 0.91,
      rationale: "The model found a direct dependency in the quoted span.",
      loadBearingScore: 0.7,
    });
    expect(body.impact).toMatchObject({
      class: "rewrite_required",
      humanReviewed: true,
    });
  });

  it("requires an audited reason before override service execution", async () => {
    const response = await overrideEdge(
      request(
        "/override",
        {
          aiRationale: "The model over-weighted a mention.",
          loadBearingScore: 0.9,
          overrideClass: "peripheral",
        },
        { "Idempotency-Key": "idem-edge-override" },
      ),
      edgeParams(),
    );

    expect(response.status).toBe(422);
    expect(overrideDependencyEdge).not.toHaveBeenCalled();
  });
});

function request(
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

function changeParams() {
  return {
    params: Promise.resolve({ changeEventId, changeEventVersionId }),
  };
}

function caseParams() {
  return {
    params: Promise.resolve({ caseId, caseVersionId }),
  };
}

function edgeParams() {
  return {
    params: Promise.resolve({ edgeId, edgeVersionId }),
  };
}

function submitChangeBody() {
  return {
    sourceId: "00000000-0000-4000-8000-000000000101",
    oldSourceVersionId: "00000000-0000-4000-8000-000000000102",
    newSourceVersionId: "00000000-0000-4000-8000-000000000103",
    versionLabel: "v2",
    oldRule: "Old threshold",
    newRule: "New threshold",
    affectedPopulation: "review team",
    diffSummary: { changed: true },
  };
}

function draftCaseBody() {
  return {
    changeEventId,
    changeEventVersionId,
    versionLabel: "case-v1",
    scenario: "Customer asks about the new threshold.",
    oldAnswer: "Use the old threshold.",
    newAnswer: "Use the new threshold.",
    rationale: "The governing source changed.",
    oldCitation: { quote: "old" },
    newCitation: { quote: "new" },
    ambiguityNote: null,
  };
}
