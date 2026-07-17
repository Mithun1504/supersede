import { describe, expect, it } from "vitest";

import { assertIdempotencyActor } from "@/lib/security/idempotency";

import {
  assertCaseApprovalAllowed,
  assertReleaseAuthorizationAllowed,
} from "@/modules/cases";
import {
  assertChangeValidationAllowed,
  measureChangeLatency,
} from "@/modules/changes";
import { planRechecks, releaseBlockedRecheck } from "@/modules/learning";

describe("governed workflow policy", () => {
  it("enforces per-object separation of duties", () => {
    expect(() =>
      assertChangeValidationAllowed({
        enteredByMembershipId: "actor-a",
        validatorMembershipId: "actor-a",
        versionLockedAt: null,
      }),
    ).toThrow("Separation of duties required");

    expect(() =>
      assertCaseApprovalAllowed({
        authoredByMembershipId: "actor-a",
        approverMembershipId: "actor-a",
        status: "draft",
      }),
    ).toThrow("Separation of duties required");

    expect(() =>
      assertReleaseAuthorizationAllowed({
        caseApproverMembershipId: "actor-b",
        releaseAuthorizerMembershipId: "actor-b",
        caseStatus: "approved",
        ambiguous: false,
      }),
    ).toThrow("Separation of duties required");
  });

  it("does not let a different actor replay another actor's idempotency key", () => {
    expect(() =>
      assertIdempotencyActor(
        { actorMembershipId: "validator-a" },
        "validator-b",
      ),
    ).toThrow("belongs to a different actor");
    expect(() =>
      assertIdempotencyActor(
        { actorMembershipId: "validator-a" },
        "validator-a",
      ),
    ).not.toThrow();
  });

  it("requires ambiguous case versions to be retired instead of approved", () => {
    expect(() =>
      assertCaseApprovalAllowed({
        authoredByMembershipId: "case-author",
        approverMembershipId: "case-approver",
        status: "draft",
        ambiguityNote: "Two answers remain defensible.",
      }),
    ).toThrow("must be retired");
  });

  it("tracks review wait and the operational validation-to-report SLA separately", () => {
    expect(
      measureChangeLatency({
        enteredAt: new Date("2026-07-15T08:00:00.000Z"),
        validatedAt: new Date("2026-07-15T09:00:00.000Z"),
        reportCompletedAt: new Date("2026-07-15T09:00:42.000Z"),
      }),
    ).toEqual({ enteredToValidatedMs: 3_600_000, validatedToReportMs: 42_000 });
  });

  it("blocks rechecks until different approved cases exist", () => {
    const plans = planRechecks({
      remediationCompletedAt: new Date("2026-07-15T00:00:00.000Z"),
      originalCaseVersionId: "case-original",
      approvedAlternativeCaseVersionIds: ["case-original", "case-30"],
    });

    expect(plans.map(({ status }) => status)).toEqual([
      "scheduled",
      "blocked_case_required",
    ]);
    expect(plans[0]?.dueAt.toISOString()).toBe("2026-08-14T00:00:00.000Z");
    expect(plans[1]?.dueAt.toISOString()).toBe("2026-10-13T00:00:00.000Z");

    expect(
      releaseBlockedRecheck({
        dueAt: new Date("2026-07-14T00:00:00.000Z"),
        now: new Date("2026-07-15T00:00:00.000Z"),
        originalCaseVersionId: "case-original",
        approvedCaseVersionId: "case-90",
      }).dueAt.toISOString(),
    ).toBe("2026-07-15T00:00:00.000Z");
  });
});
