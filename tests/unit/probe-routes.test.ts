import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as completeProbeRoute } from "@/app/api/v1/workflow/probes/[probeAssignmentId]/complete/route";
import { POST as openProbeRoute } from "@/app/api/v1/workflow/probes/[probeAssignmentId]/open/route";
import { caseApprovedPayloadSchema } from "@/inngest/functions/case-approved";
import { AppError } from "@/lib/errors/app-error";
import {
  requireRequestAuthentication,
  requireTenantActor,
} from "@/modules/identity/request-context";
import { completeProbeResponse, openProbeAssignment } from "@/modules/learning";

vi.mock("@/modules/identity/request-context", () => ({
  requireRequestAuthentication: vi.fn(),
  requireTenantActor: vi.fn(),
}));

vi.mock("@/modules/learning", () => ({
  completeProbeResponse: vi.fn(),
  openProbeAssignment: vi.fn(),
}));

const tenant = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  actorMembershipId: "00000000-0000-4000-8000-000000000002",
};
const auth = {
  workosUserId: "user_123",
  workosOrganizationId: "org_123",
  email: "learner@example.com",
  displayName: "Learner",
};
const probeAssignmentId = "00000000-0000-4000-8000-000000000011";
const probeResponseId = "00000000-0000-4000-8000-000000000012";

describe("authenticated probe mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRequestAuthentication).mockResolvedValue(auth);
    vi.mocked(requireTenantActor).mockResolvedValue({ tenant, auth });
    vi.mocked(openProbeAssignment).mockResolvedValue({
      probeAssignmentId,
      opened: true,
      actorMembershipId: tenant.actorMembershipId,
    });
    vi.mocked(completeProbeResponse).mockResolvedValue({
      probeAssignmentId,
      probeResponseId,
      answeredWith: "old",
      reviewRequired: false,
      remediationAssignmentId: "00000000-0000-4000-8000-000000000013",
      actorMembershipId: tenant.actorMembershipId,
    });
  });

  it("opens only through the authenticated tenant actor", async () => {
    const response = await openProbeRoute(
      request("/open", {}, "probe-open-key"),
      params(),
    );

    expect(response.status).toBe(200);
    expect(openProbeAssignment).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "probe-open-key",
      probeAssignmentId,
    });
  });

  it("completes a response through the governed learning service", async () => {
    const response = await completeProbeRoute(
      request(
        "/complete",
        { responseText: "Use the old threshold." },
        "probe-complete-key",
      ),
      params(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      answeredWith: "old",
      reviewRequired: false,
      remediationAssignmentId: "00000000-0000-4000-8000-000000000013",
    });
    expect(completeProbeResponse).toHaveBeenCalledWith(tenant, {
      idempotencyKey: "probe-complete-key",
      probeAssignmentId,
      responseText: "Use the old threshold.",
    });
  });

  it("authenticates before accepting probe response content", async () => {
    vi.mocked(requireRequestAuthentication).mockRejectedValueOnce(
      new AppError({
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
        status: 401,
      }),
    );

    const response = await completeProbeRoute(
      request("/complete", { responseText: "secret" }, "probe-denied-key"),
      params(),
    );

    expect(response.status).toBe(401);
    expect(completeProbeResponse).not.toHaveBeenCalled();
  });

  it("matches the case approval event emitted by the outbox", () => {
    expect(
      caseApprovedPayloadSchema.parse({
        organizationId: tenant.organizationId,
        actorMembershipId: tenant.actorMembershipId,
        caseVersionId: "00000000-0000-4000-8000-000000000021",
      }),
    ).toMatchObject({ actorMembershipId: tenant.actorMembershipId });
    expect(() =>
      caseApprovedPayloadSchema.parse({
        organizationId: tenant.organizationId,
        approverMembershipId: tenant.actorMembershipId,
        caseVersionId: "00000000-0000-4000-8000-000000000021",
      }),
    ).toThrow();
  });
});

function request(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ probeAssignmentId }) };
}
