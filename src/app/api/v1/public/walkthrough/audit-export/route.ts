import { Buffer } from "node:buffer";

import { buildAuditExportBundle, buildAuditReportInput } from "@/modules/audit";
import {
  resolvePublicWalkthroughContext,
  withTenantContext,
} from "@/db/tenant-context";

export async function GET() {
  const tenant = await resolvePublicWalkthroughContext();
  const now = new Date();
  const report = await withTenantContext(tenant, async (transaction) => {
    const active = await transaction.query.changeEventVersions.findFirst({
      where: (version, { eq }) =>
        eq(version.organizationId, tenant.organizationId),
      orderBy: (version, { desc }) => [desc(version.createdAt)],
    });
    if (!active) return undefined;
    return buildAuditReportInput(transaction, {
      organizationId: tenant.organizationId,
      changeEventId: active.changeEventId,
      changeEventVersionId: active.id,
      cutoffAt: now,
      generatedAt: now,
      retentionMode: "standard",
    });
  });
  if (!report)
    return Response.json(
      { title: "No reportable change found" },
      { status: 404 },
    );
  const bundle = await buildAuditExportBundle(report);
  return new Response(Buffer.from(bundle.bytes), {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${bundle.filename}"`,
      "content-type": "application/zip",
      "x-supersede-retention-mode": "standard-not-worm",
    },
  });
}
