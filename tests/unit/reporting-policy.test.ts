import { describe, expect, it } from "vitest";

import { buildObservableReport } from "@/modules/audit/reporting-policy";

const results = Array.from({ length: 4 }, (_, index) => ({
  personId: `person-${index}`,
  displayName: `Person ${index}`,
  cohort: "small cohort",
  outcome: "assessed_old" as const,
}));

describe("observable reporting policy", () => {
  it("suppresses small cohorts and names by default", () => {
    const report = buildObservableReport({
      results,
      individualResultsVisible: false,
    });

    expect(report.aggregate.assessed_old).toBe(4);
    expect(report.cohorts[0]).toMatchObject({
      size: 4,
      suppressed: true,
      outcomes: null,
    });
    expect(report.individualResults).toBeNull();
  });

  it("allows the explicit demo-tenant individual policy", () => {
    const report = buildObservableReport({
      results,
      individualResultsVisible: true,
    });

    expect(report.cohorts[0]?.suppressed).toBe(false);
    expect(report.individualResults?.[0]?.displayName).toBe("Person 0");
  });
});
