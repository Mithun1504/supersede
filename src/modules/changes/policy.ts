import { AppError } from "@/lib/errors/app-error";
import { requireDistinctActors } from "@/lib/security/separation-of-duties";

export function assertChangeValidationAllowed(input: {
  enteredByMembershipId: string;
  validatorMembershipId: string;
  versionLockedAt: Date | null;
}): void {
  requireDistinctActors(
    input.enteredByMembershipId,
    input.validatorMembershipId,
    "The ChangeEvent owner cannot validate the same ChangeEvent.",
  );

  if (input.versionLockedAt) {
    throw new AppError({
      code: "CONFLICT",
      message: "This ChangeEvent version is already locked.",
      status: 409,
    });
  }
}

export function measureChangeLatency(input: {
  enteredAt: Date;
  validatedAt: Date;
  reportCompletedAt: Date;
}): { enteredToValidatedMs: number; validatedToReportMs: number } {
  const enteredToValidatedMs =
    input.validatedAt.getTime() - input.enteredAt.getTime();
  const validatedToReportMs =
    input.reportCompletedAt.getTime() - input.validatedAt.getTime();

  if (enteredToValidatedMs < 0 || validatedToReportMs < 0) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "ChangeEvent timestamps are out of order.",
      status: 422,
    });
  }

  return { enteredToValidatedMs, validatedToReportMs };
}
