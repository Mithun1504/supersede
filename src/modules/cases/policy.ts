import { AppError } from "@/lib/errors/app-error";
import { requireDistinctActors } from "@/lib/security/separation-of-duties";

export function assertCaseApprovalAllowed(input: {
  authoredByMembershipId: string;
  approverMembershipId: string;
  status: "draft" | "approved" | "retired";
  ambiguityNote?: string | null;
}): void {
  requireDistinctActors(
    input.authoredByMembershipId,
    input.approverMembershipId,
    "A divergence-case author cannot approve the same case version.",
  );

  if (input.status !== "draft") {
    throw new AppError({
      code: "CONFLICT",
      message: "Only a draft case version can be approved.",
      status: 409,
    });
  }

  if (input.ambiguityNote) {
    throw new AppError({
      code: "CONFLICT",
      message: "Ambiguous case versions must be retired, not approved.",
      status: 409,
    });
  }
}

export function assertReleaseAuthorizationAllowed(input: {
  caseApproverMembershipId: string;
  releaseAuthorizerMembershipId: string;
  caseStatus: "draft" | "approved" | "retired";
  ambiguous: boolean;
}): void {
  requireDistinctActors(
    input.caseApproverMembershipId,
    input.releaseAuthorizerMembershipId,
    "A case approver cannot authorize release of the same case version.",
  );

  if (input.caseStatus !== "approved" || input.ambiguous) {
    throw new AppError({
      code: "CONFLICT",
      message: "Only an approved, unambiguous case can be released.",
      status: 409,
    });
  }
}
