import "server-only";

import { createHash, createHmac } from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, lte } from "drizzle-orm";
import JSZip from "jszip";
import { chromium } from "playwright";

import {
  memberships,
  organizations,
  retentionPolicies,
  reportBundleItems,
  reportBundles,
  storageObjects,
  workflowRuns,
} from "@/db/schema";
import { withOrganizationContext } from "@/db/tenant-context";
import { getServerEnv, requireEnv } from "@/lib/env/server";
import { getAuditStorageClient } from "@/lib/storage/clients";
import { getChangeAuditReport } from "@/modules/reports/repository";
import { renderAuditReportHtml } from "@/modules/reports/template";
import type { CurrentActor } from "@/modules/identity/policy";

const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

function releaseSha() {
  const env = getServerEnv();
  const value =
    env.APPLICATION_RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (value && /^[0-9a-f]{40}$/.test(value)) return value;
  if (env.NODE_ENV === "production")
    throw new Error(
      "APPLICATION_RELEASE_SHA is required for report provenance.",
    );
  return "0".repeat(40);
}

export async function generateReportBundle(
  organizationId: string,
  reportBundleId: string,
): Promise<{ sha256: string; sizeBytes: number }> {
  try {
    const prepared = await withOrganizationContext(
      organizationId,
      async (transaction) => {
        const [row] = await transaction
          .select({
            id: reportBundles.id,
            changeEventVersionId: reportBundles.changeEventVersionId,
            cutoff: reportBundles.queryCutoffAt,
            requesterId: reportBundles.requestedByMembershipId,
            workflowRunId: reportBundles.workflowRunId,
            organizationName: organizations.name,
            productConfiguration: organizations.productConfiguration,
            workosUserId: memberships.workosUserId,
            email: memberships.email,
            displayName: memberships.displayName,
            timezone: memberships.timezone,
          })
          .from(reportBundles)
          .innerJoin(
            organizations,
            eq(organizations.id, reportBundles.organizationId),
          )
          .innerJoin(
            memberships,
            eq(memberships.id, reportBundles.requestedByMembershipId),
          )
          .where(eq(reportBundles.id, reportBundleId))
          .limit(1);
        if (!row) throw new Error("Report request was not found.");
        const [retentionPolicy] = await transaction
          .select({
            retentionDays: retentionPolicies.retentionDays,
            retentionMode: retentionPolicies.retentionMode,
          })
          .from(retentionPolicies)
          .where(
            and(
              eq(retentionPolicies.dataClass, "report_bundle"),
              eq(retentionPolicies.status, "approved"),
              lte(retentionPolicies.effectiveFrom, new Date()),
            ),
          )
          .orderBy(desc(retentionPolicies.versionNumber))
          .limit(1);
        if (!retentionPolicy)
          throw new Error(
            "An approved report-bundle retention policy is required.",
          );
        await transaction
          .update(reportBundles)
          .set({ status: "generating" })
          .where(eq(reportBundles.id, row.id));
        await transaction
          .update(workflowRuns)
          .set({
            status: "running",
            startedAt: new Date(),
            lastHeartbeatAt: new Date(),
          })
          .where(eq(workflowRuns.id, row.workflowRunId));
        return { ...row, ...retentionPolicy };
      },
    );
    const actor: CurrentActor = {
      organization: {
        id: organizationId,
        name: prepared.organizationName,
        productConfiguration: prepared.productConfiguration,
      },
      membership: {
        id: prepared.requesterId,
        workosUserId: prepared.workosUserId,
        email: prepared.email,
        displayName: prepared.displayName,
        timezone: prepared.timezone,
      },
      roles: [],
      permissions: ["result.read_aggregate", "audit.read"],
      privilegedPermissions: [],
    };
    const report = await getChangeAuditReport(
      actor,
      prepared.changeEventVersionId,
      prepared.cutoff,
    );
    if (!report)
      throw new Error("The report ChangeEvent version was not found.");
    const html = renderAuditReportHtml({
      organizationName: prepared.organizationName,
      sourceTitle: report.change.sourceTitle,
      summary: report.change.summary,
      oldRule: report.change.oldRule,
      newRule: report.change.newRule,
      cutoff: report.cutoff,
      changeEventVersionId: report.change.id,
      metrics: report.metrics,
    });
    const browser = await chromium.launch({ headless: true });
    let pdf: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      pdf = await page.pdf({ format: "A4", printBackground: true });
    } finally {
      await browser.close();
    }
    const evidence = Buffer.from(
      JSON.stringify(
        {
          schemaVersion: "report_evidence_v1",
          organizationId,
          changeEventVersionId: report.change.id,
          queryCutoffAt: report.cutoff.toISOString(),
          metrics: report.metrics,
          timeline: report.timeline,
          applicationReleaseSha: releaseSha(),
        },
        null,
        2,
      ),
    );
    const csv = Buffer.from(
      `measure,count\n${Object.entries(report.metrics)
        .map(([key, value]) => `${key},${value}`)
        .join("\n")}\n`,
    );
    const members = [
      { path: "report.pdf", mediaType: "application/pdf", body: pdf },
      {
        path: "report.html",
        mediaType: "text/html; charset=utf-8",
        body: Buffer.from(html),
      },
      {
        path: "evidence.json",
        mediaType: "application/json",
        body: evidence,
      },
      { path: "metrics.csv", mediaType: "text/csv", body: csv },
    ];
    const manifest = {
      schemaVersion: "report_manifest_v1",
      reportBundleId,
      organizationId,
      changeEventVersionId: report.change.id,
      queryCutoffAt: report.cutoff.toISOString(),
      applicationReleaseSha: releaseSha(),
      members: members.map((member) => ({
        path: member.path,
        mediaType: member.mediaType,
        sizeBytes: member.body.byteLength,
        sha256: sha256(member.body),
      })),
    };
    const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2));
    const zip = new JSZip();
    for (const member of members) zip.file(member.path, member.body);
    zip.file("manifest.json", manifestBody);
    const bundle = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const bundleHash = sha256(bundle);
    const env = getServerEnv();
    const bucket = requireEnv("S3_AUDIT_BUCKET");
    const objectKey = `${organizationId}/reports/${reportBundleId}/${bundleHash}.zip`;
    const retainUntil = new Date(
      Math.max(Date.now(), report.cutoff.getTime()) +
        prepared.retentionDays * 24 * 60 * 60 * 1_000,
    );
    const putResult = await getAuditStorageClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: bundle,
        ContentType: "application/zip",
        Metadata: {
          organization: organizationId,
          report: reportBundleId,
          sha256: bundleHash,
        },
        ...(env.S3_ENDPOINT
          ? {}
          : {
              ObjectLockMode:
                prepared.retentionMode === "compliance"
                  ? ("COMPLIANCE" as const)
                  : ("GOVERNANCE" as const),
              ObjectLockRetainUntilDate: retainUntil,
            }),
      }),
    );
    const signature = env.REPORT_SIGNING_SECRET
      ? createHmac("sha256", env.REPORT_SIGNING_SECRET)
          .update(manifestBody)
          .digest("hex")
      : null;
    await withOrganizationContext(organizationId, async (transaction) => {
      const [stored] = await transaction
        .insert(storageObjects)
        .values({
          organizationId,
          purpose: "report_bundle",
          provider: env.S3_ENDPOINT ? "minio" : "s3",
          bucketAlias: bucket,
          objectKey,
          sha256: bundleHash,
          sizeBytes: bundle.byteLength,
          mimeType: "application/zip",
          originalFilename: `supersede-report-${reportBundleId}.zip`,
          scanStatus: "clean",
          retentionUntil: retainUntil,
          objectLockMode: prepared.retentionMode,
        })
        .returning({ id: storageObjects.id });
      if (!stored)
        throw new Error("Report storage record could not be created.");
      await transaction.insert(reportBundleItems).values([
        ...manifest.members.map((member, position) => ({
          organizationId,
          reportBundleId,
          path: member.path,
          mediaType: member.mediaType,
          sizeBytes: member.sizeBytes,
          sha256: member.sha256,
          position,
        })),
        {
          organizationId,
          reportBundleId,
          path: "manifest.json",
          mediaType: "application/json",
          sizeBytes: manifestBody.byteLength,
          sha256: sha256(manifestBody),
          position: manifest.members.length,
        },
      ]);
      await transaction
        .update(reportBundles)
        .set({
          status: "completed",
          storageObjectId: stored.id,
          bundleSha256: bundleHash,
          manifest,
          manifestSignature: signature,
          signatureAlgorithm: signature ? "hmac-sha256" : null,
          signingKeyVersion: signature ? "env-v1" : null,
          retentionMode: prepared.retentionMode,
          retainUntil,
          objectLockVersionId: putResult.VersionId ?? null,
          completedAt: new Date(),
        })
        .where(eq(reportBundles.id, reportBundleId));
      await transaction
        .update(workflowRuns)
        .set({
          status: "completed",
          progressCurrent: 1,
          progressTotal: 1,
          completedAt: new Date(),
          lastHeartbeatAt: new Date(),
        })
        .where(eq(workflowRuns.id, prepared.workflowRunId));
    });
    return { sha256: bundleHash, sizeBytes: bundle.byteLength };
  } catch (error) {
    await withOrganizationContext(organizationId, async (transaction) => {
      const [report] = await transaction
        .select({ workflowRunId: reportBundles.workflowRunId })
        .from(reportBundles)
        .where(eq(reportBundles.id, reportBundleId))
        .limit(1);
      await transaction
        .update(reportBundles)
        .set({
          status: "failed",
          errorSummary:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : "Unknown report failure",
        })
        .where(eq(reportBundles.id, reportBundleId));
      if (report)
        await transaction
          .update(workflowRuns)
          .set({
            status: "failed",
            errorCode: "report_generation_failed",
            errorSummary:
              error instanceof Error
                ? error.message.slice(0, 2_000)
                : "Unknown report failure",
            completedAt: new Date(),
          })
          .where(eq(workflowRuns.id, report.workflowRunId));
    });
    throw error;
  }
}
