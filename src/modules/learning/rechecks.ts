const RECHECK_OFFSETS_DAYS = [30, 90] as const;

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export type RecheckPlan = {
  dueAt: Date;
  caseVersionId: string | null;
  status: "scheduled" | "blocked_case_required";
};

export function planRechecks(input: {
  remediationCompletedAt: Date;
  originalCaseVersionId: string;
  approvedAlternativeCaseVersionIds: string[];
}): RecheckPlan[] {
  const alternatives = [
    ...new Set(
      input.approvedAlternativeCaseVersionIds.filter(
        (caseVersionId) => caseVersionId !== input.originalCaseVersionId,
      ),
    ),
  ];

  return RECHECK_OFFSETS_DAYS.map((days, index) => {
    const caseVersionId = alternatives[index] ?? null;
    return {
      dueAt: addUtcDays(input.remediationCompletedAt, days),
      caseVersionId,
      status: caseVersionId ? "scheduled" : "blocked_case_required",
    };
  });
}

export function releaseBlockedRecheck(input: {
  dueAt: Date;
  now: Date;
  originalCaseVersionId: string;
  approvedCaseVersionId: string;
}): RecheckPlan {
  if (input.approvedCaseVersionId === input.originalCaseVersionId) {
    throw new Error("A recheck cannot reuse the original probe case.");
  }

  return {
    dueAt: input.dueAt < input.now ? input.now : input.dueAt,
    caseVersionId: input.approvedCaseVersionId,
    status: "scheduled",
  };
}
