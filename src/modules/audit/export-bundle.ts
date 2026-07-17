import "server-only";

import { Buffer } from "node:buffer";
import { createHmac, createHash } from "node:crypto";

import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";

const forbiddenReportLanguage =
  /\b(?:belief|believes|knows|competent|incompetent)\b/i;

const auditStageSchema = z.object({
  assigned: z.number().int().nonnegative(),
  assessed: z.number().int().nonnegative(),
  remediated: z.number().int().nonnegative(),
  rechecked: z.number().int().nonnegative(),
});

const auditEventSchema = z.object({
  occurredAt: z.iso.datetime(),
  actor: z.string().min(1).max(255),
  action: z.string().min(1).max(255),
  objectType: z.string().min(1).max(64),
  objectVersion: z.string().min(1).max(255),
});

const governedApprovalActionSchema = z.enum([
  "change_validated",
  "edge_accepted",
  "edge_overridden",
  "artifact_version_approved",
  "case_approved",
  "case_retired",
  "release_authorized",
  "export_released",
  "retention_changed",
]);

const approvalRecordSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  actorMembershipId: z.uuid(),
  actorRoleCode: z.string().min(1).max(64),
  objectType: z.string().min(1).max(64),
  objectId: z.uuid(),
  objectVersionId: z.uuid(),
  action: governedApprovalActionSchema,
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const auditExportInputSchema = z
  .object({
    organizationId: z.uuid(),
    organizationName: z.string().min(1).max(255),
    changeEventId: z.uuid(),
    changeReference: z.string().min(1).max(128),
    changeVersionId: z.uuid(),
    cutoffAt: z.iso.datetime(),
    generatedAt: z.iso.datetime(),
    releaseSha: z.string().min(7).max(64),
    templateVersion: z.string().min(1).max(32),
    retentionMode: z.enum(["standard", "object_lock"]),
    stages: auditStageSchema,
    events: z.array(auditEventSchema).max(10_000),
    approvals: z.array(approvalRecordSchema).max(10_000),
  })
  .superRefine((input, context) => {
    input.approvals.forEach((approval, index) => {
      if (approval.organizationId !== input.organizationId) {
        context.addIssue({
          code: "custom",
          message: "Approval record belongs to a different organization",
          path: ["approvals", index, "organizationId"],
        });
      }
    });
  });

export type AuditExportInput = z.infer<typeof auditExportInputSchema>;

type BundleFile = {
  path: string;
  bytes: Uint8Array;
  sha256: string;
};

export type AuditExportBundle = {
  bytes: Uint8Array;
  filename: string;
  manifest: {
    schemaVersion: 1;
    changeReference: string;
    cutoffAt: string;
    generatedAt: string;
    releaseSha: string;
    templateVersion: string;
    retentionMode: "standard" | "object_lock";
    files: Array<Pick<BundleFile, "path" | "sha256"> & { size: number }>;
    signature?: { algorithm: "hmac-sha256"; value: string };
  };
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function eventsCsv(events: AuditExportInput["events"]): Uint8Array {
  const header = [
    "occurred_at",
    "actor",
    "action",
    "object_type",
    "object_version",
  ];
  const rows = events.map((event) =>
    [
      event.occurredAt,
      event.actor,
      event.action,
      event.objectType,
      event.objectVersion,
    ]
      .map(escapeCsv)
      .join(","),
  );
  return encode([header.join(","), ...rows].join("\n"));
}

function approvalsCsv(approvals: AuditExportInput["approvals"]): Uint8Array {
  const header = [
    "id",
    "organization_id",
    "actor_membership_id",
    "actor_role_code",
    "object_type",
    "object_id",
    "object_version_id",
    "action",
    "metadata_json",
    "created_at",
  ];
  const rows = approvals.map((approval) =>
    [
      approval.id,
      approval.organizationId,
      approval.actorMembershipId,
      approval.actorRoleCode,
      approval.objectType,
      approval.objectId,
      approval.objectVersionId,
      approval.action,
      JSON.stringify(approval.metadata),
      approval.createdAt,
    ]
      .map(escapeCsv)
      .join(","),
  );
  return encode([header.join(","), ...rows].join("\n"));
}

function assertReportLanguage(input: AuditExportInput): void {
  for (const event of input.events) {
    if (forbiddenReportLanguage.test(event.action)) {
      throw new Error(
        `Audit action uses prohibited mental-state language: ${event.action}`,
      );
    }
  }
}

async function renderReport(input: AuditExportInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([612, 792]);
  let y = 742;

  const line = (
    text: string,
    options?: {
      bold?: boolean;
      size?: number;
      color?: [number, number, number];
    },
  ) => {
    if (y < 60) {
      page = document.addPage([612, 792]);
      y = 742;
    }
    const [r, g, b] = options?.color ?? [0.16, 0.12, 0.17];
    page.drawText(text.slice(0, 100), {
      x: 48,
      y,
      size: options?.size ?? 10,
      font: options?.bold ? bold : regular,
      color: rgb(r, g, b),
    });
    y -= (options?.size ?? 10) + 8;
  };

  line("Supersede audit report", { bold: true, size: 22 });
  line(`${input.organizationName} · ${input.changeReference}`, { size: 12 });
  y -= 14;
  line(`Cutoff: ${input.cutoffAt}`);
  line(`Generated: ${input.generatedAt}`);
  line(
    `Retention: ${input.retentionMode === "object_lock" ? "S3 Object Lock" : "standard object storage"}`,
  );
  y -= 14;
  line("Observable workflow totals", { bold: true, size: 14 });
  line(
    `Assigned ${input.stages.assigned}   Assessed ${input.stages.assessed}   Remediated ${input.stages.remediated}   Rechecked ${input.stages.rechecked}`,
  );
  y -= 14;
  line("Event timeline", { bold: true, size: 14 });
  for (const event of input.events) {
    line(`${event.occurredAt} · ${event.actor} · ${event.action}`);
    line(`${event.objectType} · ${event.objectVersion}`, {
      size: 8,
      color: [0.4, 0.37, 0.42],
    });
  }
  y -= 10;
  line("This report records process completion and assessed responses only.", {
    bold: true,
  });
  line(`Release ${input.releaseSha} · template ${input.templateVersion}`, {
    size: 8,
  });

  document.setTitle(`Supersede audit · ${input.changeReference}`);
  document.setSubject("Observable workflow audit export");
  document.setProducer(`Supersede ${input.releaseSha}`);
  document.setCreationDate(new Date(input.generatedAt));
  return document.save({ useObjectStreams: true });
}

function toFile(path: string, bytes: Uint8Array): BundleFile {
  return { path, bytes, sha256: sha256(bytes) };
}

export async function buildAuditExportBundle(
  rawInput: AuditExportInput,
  signingSecret?: string,
): Promise<AuditExportBundle> {
  const input = auditExportInputSchema.parse(rawInput);
  assertReportLanguage(input);

  const files = [
    toFile("report.pdf", await renderReport(input)),
    toFile("evidence.json", encode(JSON.stringify(input, null, 2))),
    toFile("events.csv", eventsCsv(input.events)),
    toFile("approvals.csv", approvalsCsv(input.approvals)),
  ];

  const manifest: AuditExportBundle["manifest"] = {
    schemaVersion: 1,
    changeReference: input.changeReference,
    cutoffAt: input.cutoffAt,
    generatedAt: input.generatedAt,
    releaseSha: input.releaseSha,
    templateVersion: input.templateVersion,
    retentionMode: input.retentionMode,
    files: files.map(({ path, bytes, sha256: digest }) => ({
      path,
      size: bytes.byteLength,
      sha256: digest,
    })),
  };

  if (signingSecret) {
    const unsigned = JSON.stringify(manifest);
    manifest.signature = {
      algorithm: "hmac-sha256",
      value: createHmac("sha256", signingSecret).update(unsigned).digest("hex"),
    };
  }

  const zip = new JSZip();
  for (const file of files) zip.file(file.path, Buffer.from(file.bytes));
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  return {
    bytes: await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    }),
    filename: `supersede-audit-${input.changeReference.toLowerCase()}.zip`,
    manifest,
  };
}
