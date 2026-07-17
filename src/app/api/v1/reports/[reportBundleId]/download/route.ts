import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";

import { reportBundles, storageObjects } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { getAuditStorageClient } from "@/lib/storage/clients";
import { getRequestId, problemResponse } from "@/lib/api/responses";
import { AppError } from "@/lib/errors/app-error";
import { authorize, requireCurrentActor } from "@/modules/identity/policy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reportBundleId: string }> },
) {
  const requestId = getRequestId(request);
  try {
    const actor = await requireCurrentActor();
    authorize(actor, "report.export");
    const { reportBundleId } = await params;
    const object = await withTenantContext(
      {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
      },
      async (transaction) => {
        const [row] = await transaction
          .select({
            bucket: storageObjects.bucketAlias,
            key: storageObjects.objectKey,
          })
          .from(reportBundles)
          .innerJoin(
            storageObjects,
            eq(storageObjects.id, reportBundles.storageObjectId),
          )
          .where(
            and(
              eq(reportBundles.id, reportBundleId),
              eq(reportBundles.status, "completed"),
            ),
          )
          .limit(1);
        return row ?? null;
      },
    );
    if (!object)
      throw new AppError({
        code: "NOT_FOUND",
        message: "Report bundle not found.",
        status: 404,
      });
    const url = await getSignedUrl(
      getAuditStorageClient(),
      new GetObjectCommand({
        Bucket: object.bucket,
        Key: object.key,
        ResponseContentDisposition: `attachment; filename="supersede-report-${reportBundleId}.zip"`,
      }),
      { expiresIn: 5 * 60 },
    );
    return new Response(null, {
      status: 303,
      headers: {
        location: url,
        "x-request-id": requestId,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return problemResponse(error, requestId, new URL(request.url).pathname);
  }
}
