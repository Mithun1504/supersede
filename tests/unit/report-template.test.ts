import { describe, expect, it } from "vitest";

import { renderAuditReportHtml } from "@/modules/reports/template";

const metrics = {
  affectedArtifacts: 4,
  artifactsVerified: 3,
  peopleAssigned: 8,
  peopleAssessed: 6,
  peopleRemediated: 2,
  rechecksDue: 2,
  rechecksClean: 1,
};

describe("audit report template", () => {
  it("uses observable language and escapes governed text", () => {
    const html = renderAuditReportHtml({
      organizationName: "Example <Health>",
      sourceTitle: "Protocol P-114",
      summary: "Threshold changed",
      oldRule: "Use < 10",
      newRule: "Use < 12",
      cutoff: new Date("2026-07-15T00:00:00.000Z"),
      changeEventVersionId: "00000000-0000-4000-8000-000000000001",
      metrics,
    });

    expect(html).toContain("Example &lt;Health&gt;");
    expect(html).toContain("Use &lt; 12");
    expect(html).toContain("People assessed");
    expect(html).not.toMatch(
      /\b(belief|believes|knows|knowledge|competent|compliance)\b/i,
    );
  });
});
