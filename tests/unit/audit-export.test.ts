import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { buildAuditExportBundle, type AuditExportInput } from "@/modules/audit";

const input: AuditExportInput = {
  organizationId: "9fdddb7b-2b87-4740-a822-88f149a29994",
  organizationName: "St. Marlowe Health",
  changeEventId: "b5cd827e-f4c8-4694-bb4c-f2de3724dede",
  changeReference: "CE-2026-0714-001",
  changeVersionId: "5ad53f6f-9a59-4777-af68-8b2db2f9d2c6",
  cutoffAt: "2026-07-15T07:30:00.000Z",
  generatedAt: "2026-07-15T07:31:00.000Z",
  releaseSha: "abcdef1234567890",
  templateVersion: "1.0.0",
  retentionMode: "standard",
  stages: { assigned: 8, assessed: 8, remediated: 1, rechecked: 0 },
  events: [
    {
      occurredAt: "2026-07-15T06:30:00.000Z",
      actor: "Dr. J. Morgan",
      action: "Change validated",
      objectType: "change_event",
      objectVersion: "CE-2026-0714-001@v1",
    },
  ],
  approvals: [
    {
      id: "02a6246f-8025-4fa7-ab3a-7094e75cf691",
      organizationId: "9fdddb7b-2b87-4740-a822-88f149a29994",
      actorMembershipId: "d22daf38-ef36-4f41-8c56-f54676aa75fe",
      actorRoleCode: "change_validator",
      objectType: "change_event",
      objectId: "b5cd827e-f4c8-4694-bb4c-f2de3724dede",
      objectVersionId: "5ad53f6f-9a59-4777-af68-8b2db2f9d2c6",
      action: "change_validated",
      metadata: {},
      createdAt: "2026-07-15T06:30:00.000Z",
    },
  ],
};

describe("buildAuditExportBundle", () => {
  it("emits a checksummed PDF, JSON, CSV, and manifest", async () => {
    const bundle = await buildAuditExportBundle(input, "test-secret");
    const archive = await JSZip.loadAsync(bundle.bytes);

    expect(Object.keys(archive.files).sort()).toEqual([
      "approvals.csv",
      "events.csv",
      "evidence.json",
      "manifest.json",
      "report.pdf",
    ]);
    expect(bundle.manifest.files).toHaveLength(4);
    expect(bundle.manifest.signature?.algorithm).toBe("hmac-sha256");
    expect(bundle.manifest.retentionMode).toBe("standard");
    await expect(
      archive.file("approvals.csv")?.async("string"),
    ).resolves.toContain("actor_membership_id,actor_role_code");
    await expect(
      archive.file("approvals.csv")?.async("string"),
    ).resolves.toContain("change_validated");
  });

  it("rejects prohibited mental-state claims in report actions", async () => {
    await expect(
      buildAuditExportBundle({
        ...input,
        events: [{ ...input.events[0]!, action: "Learner knows the new rule" }],
      }),
    ).rejects.toThrow("prohibited mental-state language");
  });

  it("rejects display labels masquerading as governed approvals", async () => {
    await expect(
      buildAuditExportBundle({
        ...input,
        approvals: [{ ...input.approvals[0]!, action: "Validated" }],
      } as unknown as AuditExportInput),
    ).rejects.toThrow();
  });
});
