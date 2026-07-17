import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can, requirePermission } from "@/modules/identity/policy";
import {
  getChangeAuditReport,
  listReportBundles,
  listReportableChanges,
} from "@/modules/reports/repository";
import { ReportRequestForm } from "@/modules/reports/components/report-request-form";

export const metadata: Metadata = { title: "Audit reports" };

function ratio(value: number, total: number) {
  return total === 0
    ? "Not applicable"
    : `${Math.round((value / total) * 100)}%`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ change?: string; cutoff?: string }>;
}) {
  const actor = await requirePermission("result.read_aggregate");
  const params = await searchParams;
  const [changes, bundles] = await Promise.all([
    listReportableChanges(actor),
    listReportBundles(actor),
  ]);
  const selectedId = params.change ?? changes[0]?.id;
  const requestedCutoff = params.cutoff ? new Date(params.cutoff) : new Date();
  const cutoff =
    Number.isFinite(requestedCutoff.getTime()) && requestedCutoff <= new Date()
      ? requestedCutoff
      : new Date();
  const report = selectedId
    ? await getChangeAuditReport(actor, selectedId, cutoff)
    : null;
  const metricCards = report
    ? [
        {
          label: "Artifacts updated",
          value: ratio(
            report.metrics.artifactsVerified,
            report.metrics.affectedArtifacts,
          ),
          detail: `${report.metrics.artifactsVerified} of ${report.metrics.affectedArtifacts} impacted artifacts verified`,
        },
        {
          label: "People assessed",
          value: ratio(
            report.metrics.peopleAssessed,
            report.metrics.peopleAssigned,
          ),
          detail: `${report.metrics.peopleAssessed} of ${report.metrics.peopleAssigned} assigned people submitted a valid assessed response`,
        },
        {
          label: "People remediated",
          value: String(report.metrics.peopleRemediated),
          detail: "People with a passed correction activity",
        },
        {
          label: "Rechecks clean",
          value: ratio(
            report.metrics.rechecksClean,
            report.metrics.rechecksDue,
          ),
          detail: `${report.metrics.rechecksClean} of ${report.metrics.rechecksDue} due distinct-case rechecks assessed new-rule`,
        },
      ]
    : [];
  return (
    <div className="space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">Observable audit facts</p>
        <h1 className="text-3xl font-semibold">Change reports</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Metrics describe assignments, submitted assessments, passed correction
          work, and distinct-case rechecks. They do not infer a person’s mental
          state.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Report scope</CardTitle>
          <CardDescription>
            Queries are stable at the selected UTC cutoff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="text-sm font-medium">
              Validated change
              <select
                name="change"
                defaultValue={selectedId}
                className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3"
              >
                {changes.map((change) => (
                  <option key={change.id} value={change.id}>
                    {change.sourceTitle} · {change.summary}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Cutoff (UTC)
              <input
                type="datetime-local"
                name="cutoff"
                defaultValue={cutoff.toISOString().slice(0, 16)}
                max={new Date().toISOString().slice(0, 16)}
                className="border-input bg-background mt-1 h-10 rounded-lg border px-3"
              />
            </label>
            <Button type="submit">Run report</Button>
          </form>
        </CardContent>
      </Card>
      {report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-3xl">{metric.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-xs">
                    {metric.detail}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{report.change.sourceTitle}</CardTitle>
              <CardDescription>{report.change.summary}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border p-4">
                <Badge variant="outline">Previous rule</Badge>
                <p className="mt-3 text-sm">{report.change.oldRule}</p>
              </div>
              <div className="rounded-xl border p-4">
                <Badge>Updated rule</Badge>
                <p className="mt-3 text-sm">{report.change.newRule}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Append-only timeline</CardTitle>
              <CardDescription>
                Events directly attached to this exact ChangeEvent version.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.timeline.length ? (
                report.timeline.map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-wrap justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{event.eventType}</p>
                      <p className="text-muted-foreground text-xs">
                        {event.actorType} · {event.objectType}
                      </p>
                    </div>
                    <time className="text-muted-foreground text-xs">
                      {event.occurredAt.toISOString()}
                    </time>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  No direct events at this cutoff.
                </p>
              )}
            </CardContent>
          </Card>
          {can(actor, "report.export") ? (
            <Card>
              <CardHeader>
                <CardTitle>Verifiable export</CardTitle>
                <CardDescription>
                  Versioned HTML/PDF, CSV/JSON evidence, and a checksum manifest
                  are packaged at this exact cutoff.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReportRequestForm
                  changeEventVersionId={report.change.id}
                  cutoff={report.cutoff.toISOString()}
                  idempotencyKey={randomUUID()}
                />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Export ledger</CardTitle>
              <CardDescription>
                Stored bundle hashes remain visible independently of downloads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bundles.length ? (
                bundles.map((bundle) => (
                  <div
                    key={bundle.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <Badge className="capitalize">
                        {bundle.status.replaceAll("_", " ")}
                      </Badge>
                      <p className="text-muted-foreground mt-2 font-mono text-xs break-all">
                        {bundle.sha256 ??
                          bundle.errorSummary ??
                          "Generation queued"}
                      </p>
                    </div>
                    {bundle.status === "completed" &&
                    can(actor, "report.export") ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/api/v1/reports/${bundle.id}/download`}>
                          Download bundle
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  No export requests yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No validated changes</CardTitle>
            <CardDescription>
              Validate a ChangeEvent before reporting.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
