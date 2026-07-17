import { z } from "zod";

const outcomeSchema = z.enum([
  "assigned",
  "assessed_old",
  "assessed_new",
  "assessed_other",
  "remediated",
  "recheck_pending",
  "rechecked",
]);

const resultSchema = z.object({
  personId: z.string().min(1),
  displayName: z.string().min(1),
  cohort: z.string().min(1),
  outcome: outcomeSchema,
});

export type ObservableResult = z.infer<typeof resultSchema>;

export function buildObservableReport(input: {
  results: ObservableResult[];
  individualResultsVisible: boolean;
  minimumCohortSize?: number;
}) {
  const results = z.array(resultSchema).parse(input.results);
  const minimum = input.minimumCohortSize ?? 5;
  if (!Number.isInteger(minimum) || minimum < 1) {
    throw new Error("minimum cohort size must be a positive integer");
  }

  const aggregate = countOutcomes(results);
  const cohortMap = new Map<string, ObservableResult[]>();
  for (const result of results) {
    const cohort = cohortMap.get(result.cohort);
    if (cohort) cohort.push(result);
    else cohortMap.set(result.cohort, [result]);
  }
  const cohorts = Array.from(cohortMap, ([cohort, cohortResults]) => ({
    cohort,
    size: cohortResults.length,
    suppressed:
      cohortResults.length < minimum && !input.individualResultsVisible,
    outcomes:
      cohortResults.length < minimum && !input.individualResultsVisible
        ? null
        : countOutcomes(cohortResults),
  }));

  return {
    aggregate,
    cohorts,
    individualResults: input.individualResultsVisible ? results : null,
    policy: {
      mode: input.individualResultsVisible
        ? "individual_enabled"
        : "aggregate_only",
      minimumCohortSize: minimum,
    },
  } as const;
}

function countOutcomes(results: ObservableResult[]) {
  return Object.fromEntries(
    outcomeSchema.options.map((outcome) => [
      outcome,
      results.filter((result) => result.outcome === outcome).length,
    ]),
  ) as Record<z.infer<typeof outcomeSchema>, number>;
}
