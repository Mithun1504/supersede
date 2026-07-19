import { Buffer } from "node:buffer";

import { getPublicWalkthroughAuditBundle } from "@/modules/audit";

export async function GET() {
  const bundle = await getPublicWalkthroughAuditBundle();
  if (!bundle)
    return Response.json(
      { title: "No reportable change found" },
      { status: 404 },
    );
  return new Response(Buffer.from(bundle.bytes), {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${bundle.filename}"`,
      "content-type": "application/zip",
      "x-supersede-bundle-sha256": bundle.sha256,
      "x-supersede-retention-mode": "standard-not-worm",
    },
  });
}
