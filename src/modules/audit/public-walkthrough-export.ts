import "server-only";

import {
  resolvePublicWalkthroughContext,
  withTenantContext,
} from "@/db/tenant-context";
import {
  buildAuditExportBundle,
  type AuditExportBundle,
} from "@/modules/audit/export-bundle";
import { buildAuditReportInput } from "@/modules/audit/generation-evidence";

export async function getPublicWalkthroughAuditBundle(): Promise<
  AuditExportBundle | undefined
> {
  const tenant = await resolvePublicWalkthroughContext();
  const reportInput = await withTenantContext(tenant, async (transaction) => {
    const active = await transaction.query.changeEventVersions.findFirst({
      where: (version, { eq }) =>
        eq(version.organizationId, tenant.organizationId),
      orderBy: (version, { desc }) => [desc(version.createdAt)],
    });
    if (!active) return undefined;

    const lockedReport = await transaction.query.reportBundles.findFirst({
      where: (report, { and, eq }) =>
        and(
          eq(report.organizationId, tenant.organizationId),
          eq(report.changeEventVersionId, active.id),
        ),
      orderBy: (report, { desc }) => [desc(report.createdAt)],
    });
    if (!lockedReport) return undefined;

    return buildAuditReportInput(transaction, {
      organizationId: tenant.organizationId,
      changeEventId: active.changeEventId,
      changeEventVersionId: active.id,
      cutoffAt: lockedReport.cutoffAt,
      generatedAt: lockedReport.lockedAt,
      retentionMode: "standard",
    });
  });

  return reportInput ? buildAuditExportBundle(reportInput) : undefined;
}
