import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as retentionChangeRoute } from "@/app/api/v1/exports/report-bundles/[reportBundleId]/retention/route";
import { POST as exportReleaseRoute } from "@/app/api/v1/exports/report-bundles/[reportBundleId]/release/route";
import { POST as generateReportBundleRoute } from "@/app/api/v1/exports/route";
import { POST as assignOwnerRoute } from "@/app/api/v1/workflow/artifacts/[artifactId]/assign-owner/route";
import { POST as approveArtifactRoute } from "@/app/api/v1/workflow/artifacts/[artifactId]/versions/[artifactVersionId]/approve/route";
import { POST as publishArtifactRoute } from "@/app/api/v1/workflow/artifacts/[artifactId]/versions/[artifactVersionId]/publish/route";
import { POST as submitVersionRoute } from "@/app/api/v1/workflow/artifacts/[artifactId]/versions/route";
import { POST as triageArtifactRoute } from "@/app/api/v1/workflow/artifacts/[artifactId]/triage/route";
import {
  approveArtifactVersion,
  assignArtifactOwner,
  publishArtifactVersion,
  submitCorrectedArtifactVersion,
  triageArtifactImpact,
} from "@/modules/artifacts";
import {
  approveRetentionChange,
  authorizeExportRelease,
  generateAuditReportBundle,
} from "@/modules/audit";
import {
  requireRequestAuthentication,
  requireTenantActor,
} from "@/modules/identity/request-context";

vi.mock("@/modules/identity/request-context", () => ({
  requireRequestAuthentication: vi.fn(),
  requireTenantActor: vi.fn(),
}));

vi.mock("@/modules/artifacts", () => ({
  approveArtifactVersion: vi.fn(),
  assignArtifactOwner: vi.fn(),
  publishArtifactVersion: vi.fn(),
  submitCorrectedArtifactVersion: vi.fn(),
  triageArtifactImpact: vi.fn(),
}));

vi.mock("@/modules/audit", () => ({
  approveRetentionChange: vi.fn(),
  authorizeExportRelease: vi.fn(),
  generateAuditReportBundle: vi.fn(),
}));

const tenant = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  actorMembershipId: "00000000-0000-4000-8000-000000000002",
};
const auth = {
  workosUserId: "user_123",
  workosOrganizationId: "org_123",
  email: "auditor@example.com",
  displayName: "Auditor",
};
const artifactId = "00000000-0000-4000-8000-000000000041";
const artifactVersionId = "00000000-0000-4000-8000-000000000042";
const parentArtifactVersionId = "00000000-0000-4000-8000-000000000043";
const changeEventId = "00000000-0000-4000-8000-000000000040";
const changeEventVersionId = "00000000-0000-4000-8000-000000000044";
const ownerMembershipId = "00000000-0000-4000-8000-000000000045";
const reportBundleId = "00000000-0000-4000-8000-000000000046";

describe("artifact and export approval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRequestAuthentication).mockResolvedValue(auth);
    vi.mocked(requireTenantActor).mockResolvedValue({ tenant, auth });
    vi.mocked(triageArtifactImpact).mockResolvedValue({
      artifactId,
      artifactVersionId,
    });
    vi.mocked(assignArtifactOwner).mockResolvedValue({ artifactId });
    vi.mocked(submitCorrectedArtifactVersion).mockResolvedValue({
      artifactId,
      artifactVersionId,
    });
    vi.mocked(approveArtifactVersion).mockResolvedValue({
      artifactId,
      artifactVersionId,
    });
    vi.mocked(publishArtifactVersion).mockResolvedValue({
      artifactId,
      artifactVersionId,
    });
    vi.mocked(authorizeExportRelease).mockResolvedValue({ reportBundleId });
    vi.mocked(approveRetentionChange).mockResolvedValue({
      reportBundleId,
      retentionMode: "standard",
      worm: false,
    });
    vi.mocked(generateAuditReportBundle).mockResolvedValue({
      reportBundleId,
      storageObjectKey:
        "organizations/00000000-0000-4000-8000-000000000001/changes/00000000-0000-4000-8000-000000000044/versions/00000000-0000-4000-8000-000000000044/supersede-audit.zip",
      sha256: "a".repeat(64),
      retentionMode: "standard",
      worm: false,
    });
  });

  it("routes the artifact lifecycle to governed services", async () => {
    await triageArtifactRoute(
      request(
        "/triage",
        {
          artifactVersionId,
          changeEventVersionId,
          decision: "requires_correction",
          rationale: "Load-bearing claim changed.",
        },
        { "Idempotency-Key": "idem-artifact-triage" },
      ),
      artifactParams(),
    );
    await assignOwnerRoute(
      request(
        "/assign-owner",
        { ownerMembershipId, reason: "Protocol owner owns corrections." },
        { "Idempotency-Key": "idem-artifact-owner" },
      ),
      artifactParams(),
    );
    await submitVersionRoute(
      request(
        "/versions",
        {
          parentArtifactVersionId,
          versionLabel: "v2",
          bodyText: "Corrected artifact body.",
          fileSha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        { "Idempotency-Key": "idem-artifact-version" },
      ),
      artifactParams(),
    );
    await approveArtifactRoute(
      request("/approve", {}, { "Idempotency-Key": "idem-artifact-approve" }),
      artifactVersionParams(),
    );
    await publishArtifactRoute(
      request("/publish", {}, { "Idempotency-Key": "idem-artifact-publish" }),
      artifactVersionParams(),
    );

    expect(triageArtifactImpact).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-artifact-triage",
      artifactId,
      artifactVersionId,
      changeEventVersionId,
      decision: "requires_correction",
      rationale: "Load-bearing claim changed.",
    });
    expect(assignArtifactOwner).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-artifact-owner",
      artifactId,
      ownerMembershipId,
      reason: "Protocol owner owns corrections.",
    });
    expect(submitCorrectedArtifactVersion).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-artifact-version",
      artifactId,
      parentArtifactVersionId,
      versionLabel: "v2",
      bodyText: "Corrected artifact body.",
      fileSha256:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(approveArtifactVersion).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-artifact-approve",
      artifactId,
      artifactVersionId,
    });
    expect(publishArtifactVersion).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-artifact-publish",
      artifactId,
      artifactVersionId,
    });
  });

  it("routes export release and retention approvals", async () => {
    await exportReleaseRoute(
      request("/release", {}, { "Idempotency-Key": "idem-export-release" }),
      reportBundleParams(),
    );
    const retention = await retentionChangeRoute(
      request(
        "/retention",
        {
          retentionMode: "standard",
          reason: "Legal review selected standard storage.",
        },
        { "Idempotency-Key": "idem-retention-change" },
      ),
      reportBundleParams(),
    );

    expect(retention.status).toBe(200);
    expect(authorizeExportRelease).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-export-release",
      reportBundleId,
    });
    expect(approveRetentionChange).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-retention-change",
      reportBundleId,
      retentionMode: "standard",
      reason: "Legal review selected standard storage.",
    });
  });

  it("routes authenticated report generation with standard retention by default", async () => {
    const response = await generateReportBundleRoute(
      request(
        "/api/v1/exports",
        { changeEventId, changeEventVersionId },
        { "Idempotency-Key": "idem-report-generate" },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      reportBundleId,
      retentionMode: "standard",
      worm: false,
    });
    expect(generateAuditReportBundle).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "idem-report-generate",
      changeEventId,
      changeEventVersionId,
      retentionMode: "standard",
    });
    expect(authorizeExportRelease).not.toHaveBeenCalled();
  });

  it("validates report generation UUIDs before service execution", async () => {
    const response = await generateReportBundleRoute(
      request(
        "/api/v1/exports",
        { changeEventId: "not-a-uuid", changeEventVersionId },
        { "Idempotency-Key": "idem-report-generate" },
      ),
    );

    expect(response.status).toBe(422);
    expect(generateAuditReportBundle).not.toHaveBeenCalled();
  });

  it("requires a retention change reason before service authorization", async () => {
    const response = await retentionChangeRoute(
      request(
        "/retention",
        {
          retentionMode: "object_lock",
          retainUntil: "2030-01-01T00:00:00.000Z",
        },
        { "Idempotency-Key": "idem-retention-change" },
      ),
      reportBundleParams(),
    );

    expect(response.status).toBe(422);
    expect(approveRetentionChange).not.toHaveBeenCalled();
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

function artifactParams() {
  return { params: Promise.resolve({ artifactId }) };
}

function artifactVersionParams() {
  return { params: Promise.resolve({ artifactId, artifactVersionId }) };
}

function reportBundleParams() {
  return { params: Promise.resolve({ reportBundleId }) };
}
