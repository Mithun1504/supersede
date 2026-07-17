import { Buffer } from "node:buffer";

import { buildAuditExportBundle } from "@/modules/audit";

const seededEvents = [
  [
    "2026-07-14T14:21:00.000Z",
    "Dr. A. Patel",
    "Submitted",
    "change_event",
    "v1",
  ],
  [
    "2026-07-14T15:03:00.000Z",
    "Dr. J. Morgan",
    "Validated",
    "change_event",
    "v1",
  ],
  [
    "2026-07-14T16:15:00.000Z",
    "Dr. M. Reynolds",
    "Case approved",
    "divergence_case",
    "v1",
  ],
  [
    "2026-07-14T16:58:00.000Z",
    "Dr. K. Osei",
    "Release authorized",
    "change_event",
    "v1",
  ],
  [
    "2026-07-14T17:02:00.000Z",
    "System",
    "Artifact published",
    "artifact",
    "v5.5",
  ],
  [
    "2026-07-14T17:26:00.000Z",
    "System",
    "Probe delivered",
    "probe_assignment",
    "v1",
  ],
] as const;

const organizationId = "00000000-0000-4000-8000-000000000001";
const changeEventId = "00000000-0000-4000-8000-000000000101";
const changeVersionId = "00000000-0000-4000-8000-000000000102";
const caseId = "00000000-0000-4000-8000-000000000201";
const caseVersionId = "00000000-0000-4000-8000-000000000202";

const seededApprovals = [
  {
    id: "00000000-0000-4000-8000-000000000301",
    organizationId,
    actorMembershipId: "00000000-0000-4000-8000-000000000401",
    actorRoleCode: "change_validator",
    objectType: "change_event",
    objectId: changeEventId,
    objectVersionId: changeVersionId,
    action: "change_validated" as const,
    metadata: {},
    createdAt: "2026-07-14T15:03:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000302",
    organizationId,
    actorMembershipId: "00000000-0000-4000-8000-000000000402",
    actorRoleCode: "case_approver",
    objectType: "divergence_case",
    objectId: caseId,
    objectVersionId: caseVersionId,
    action: "case_approved" as const,
    metadata: {},
    createdAt: "2026-07-14T16:15:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000303",
    organizationId,
    actorMembershipId: "00000000-0000-4000-8000-000000000403",
    actorRoleCode: "release_authorizer",
    objectType: "divergence_case",
    objectId: caseId,
    objectVersionId: caseVersionId,
    action: "release_authorized" as const,
    metadata: {},
    createdAt: "2026-07-14T16:58:00.000Z",
  },
] as const;

export async function GET() {
  const events = seededEvents.map(
    ([occurredAt, actor, action, objectType, objectVersion]) => ({
      occurredAt,
      actor,
      action,
      objectType,
      objectVersion,
    }),
  );
  const bundle = await buildAuditExportBundle({
    organizationId,
    organizationName: "St. Marlowe Health",
    changeEventId,
    changeReference: "CE-2026-0714-001",
    changeVersionId,
    cutoffAt: "2026-07-14T18:00:00.000Z",
    generatedAt: "2026-07-14T18:00:00.000Z",
    releaseSha: "seeded-walkthrough",
    templateVersion: "1.0",
    retentionMode: "standard",
    stages: { assigned: 12, assessed: 12, remediated: 3, rechecked: 1 },
    events,
    approvals: [...seededApprovals],
  });

  return new Response(Buffer.from(bundle.bytes), {
    headers: {
      "cache-control": "public, max-age=3600, immutable",
      "content-disposition": `attachment; filename="${bundle.filename}"`,
      "content-type": "application/zip",
      "x-supersede-retention-mode": "standard-not-worm",
    },
  });
}
