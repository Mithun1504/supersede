import { inngest } from "@/inngest/client";
import { generateReportBundle } from "@/modules/reports/generation";

export const reportGeneration = inngest.createFunction(
  {
    id: "report-generation-v1",
    name: "Generate checksummed audit report bundle",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.organizationId" },
    triggers: { event: "report/requested" },
  },
  async ({ event, step }) => {
    const data = event.data as {
      organizationId: string;
      reportBundleId: string;
    };
    return step.run("render-package-store", () =>
      generateReportBundle(data.organizationId, data.reportBundleId),
    );
  },
);
