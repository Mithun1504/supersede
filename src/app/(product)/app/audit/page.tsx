import type { Metadata } from "next";

import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export const metadata: Metadata = { title: "Audit trail" };

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDateTime(value: string) {
  return `${dateTimeFormatter.format(new Date(value))} UTC`;
}

function formatToken(value: string) {
  return value.replace(/[._]/g, " ");
}

export default async function AuditPage() {
  const data = await getProductWorkspace();
  const latestReport = data.reports[0];
  const learners = [
    ...new Map(data.probes.map((probe) => [probe.personId, probe])).values(),
  ];
  const timelineLabel =
    data.timeline.length === 100
      ? "Latest 100 events"
      : `${data.timeline.length} events`;
  const stages = [
    ["Assigned", data.probes.length, "governed assignments"],
    [
      "Assessed",
      data.probes.filter((probe) => probe.gradingConfidence !== null).length,
      "recorded assessments",
    ],
    [
      "Remediated",
      data.probes.filter((probe) => probe.remediationStatus === "passed")
        .length,
      "passed corrective work",
    ],
    [
      "Rechecked",
      learners.reduce((sum, probe) => sum + probe.recheckCompleted, 0),
      "different-case completions",
    ],
  ] as const;

  return (
    <AuthenticatedProductShell
      active="audit"
      title="Audit trail"
      description="Trace the assignments, decisions, approvals, and export evidence linked to the active change dossier."
      action={
        !data.viewer.authenticated ? (
          <Button asChild variant="outline">
            <a href="/api/v1/public/walkthrough/audit-export" download>
              Download public demo bundle
            </a>
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-5">
        <Surface className="overflow-hidden">
          <SectionTitle
            title="Closure ledger"
            detail={`Observable outcomes for ${data.change.reference}. Counts follow the audit report contract.`}
          />
          <ol
            className="scrollbar-subtle focus-visible:ring-ring divide-border flex divide-x overflow-x-auto focus-visible:ring-3 focus-visible:outline-none"
            aria-label="Audit closure sequence"
            tabIndex={0}
          >
            {stages.map(([label, value, detail], index) => (
              <li className="min-w-44 flex-1 px-5 py-4" key={label}>
                <p className="data-label">
                  {String(index + 1).padStart(2, "0")} · {label}
                </p>
                <p className="font-heading mt-3 text-2xl font-semibold tabular-nums">
                  {value}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
              </li>
            ))}
          </ol>
        </Surface>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Surface className="min-w-0 overflow-hidden">
            <SectionTitle
              title="Append-only events"
              detail={`${timelineLabel} · ${data.approvals.length} approval records · ${data.reports.length} stored bundles`}
            />
            <div
              className="scrollbar-subtle focus-visible:ring-ring overflow-x-auto focus-visible:ring-3 focus-visible:outline-none"
              tabIndex={0}
              role="region"
              aria-label="Audit events table"
            >
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">
                  Append-only audit events for {data.change.reference}
                </caption>
                <thead className="text-muted-foreground border-border border-b text-xs">
                  <tr>
                    <th className="px-5 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Object</th>
                    <th className="px-4 py-3 font-medium">Version</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {data.timeline.map((event) => (
                    <tr
                      className="hover:bg-muted/40 transition-colors duration-150"
                      key={event.id}
                    >
                      <td className="px-5 py-4 font-mono text-xs whitespace-nowrap">
                        <time dateTime={event.occurredAt}>
                          {formatDateTime(event.occurredAt)}
                        </time>
                      </td>
                      <td className="px-4 py-4 font-medium">
                        {event.actor || "System"}
                      </td>
                      <td className="px-4 py-4 capitalize">
                        {formatToken(event.eventType)}
                      </td>
                      <td className="text-muted-foreground px-4 py-4 font-mono text-xs break-all">
                        {formatToken(event.objectType)} · {event.objectId}
                      </td>
                      <td className="text-muted-foreground px-4 py-4 font-mono text-xs break-all">
                        {event.objectVersionId ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.timeline.length ? (
              <p className="text-muted-foreground border-border border-t p-5 text-sm">
                No append-only events are linked to this change.
              </p>
            ) : null}
          </Surface>

          <div className="grid h-fit gap-5 xl:sticky xl:top-24">
            <Surface className="overflow-hidden">
              <SectionTitle
                title="Stored audit packet"
                detail="Verification evidence from the latest generated report bundle."
              />
              <dl className="divide-border divide-y px-5">
                <Verification
                  label="Report cutoff"
                  value={
                    latestReport
                      ? formatDateTime(latestReport.cutoffAt)
                      : "No stored bundle"
                  }
                />
                <Verification
                  label="Locked"
                  value={
                    latestReport
                      ? formatDateTime(latestReport.lockedAt)
                      : "Not available"
                  }
                />
                <Verification
                  label="SHA-256 checksum"
                  value={latestReport?.sha256 ?? "Not available"}
                  mono
                />
                <Verification
                  label="Report bundle"
                  value={latestReport?.id ?? "Not available"}
                  mono
                />
              </dl>
              <p className="text-muted-foreground border-border border-t px-5 py-4 text-xs leading-5">
                Retention mode is not exposed by this workspace view. Verify the
                bundle manifest before release. The download above is generated
                from public demo data using standard storage, not WORM.
              </p>
            </Surface>

            <Surface className="overflow-hidden">
              <SectionTitle
                title="Governed approvals"
                detail="Actor, role, action, and locked object version."
              />
              <div className="divide-border divide-y">
                {data.approvals.map((approval) => (
                  <article className="space-y-2 px-5 py-4" key={approval.id}>
                    <p className="text-sm font-semibold capitalize">
                      {formatToken(approval.action)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {approval.actor} · {formatToken(approval.role)} ·{" "}
                      <time dateTime={approval.createdAt}>
                        {formatDateTime(approval.createdAt)}
                      </time>
                    </p>
                    <dl className="text-muted-foreground grid gap-1 font-mono text-xs break-all">
                      <div>
                        <dt className="inline font-sans">Object · </dt>
                        <dd className="inline">
                          {formatToken(approval.objectType)} ·{" "}
                          {approval.objectId}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-sans">Version ID · </dt>
                        <dd className="inline">{approval.objectVersionId}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
                {!data.approvals.length ? (
                  <p className="text-muted-foreground px-5 py-4 text-sm">
                    No governed approvals are linked to this change.
                  </p>
                ) : null}
              </div>
            </Surface>
          </div>
        </section>
      </div>
    </AuthenticatedProductShell>
  );
}

function Verification({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="py-4">
      <dt className="data-label">{label}</dt>
      <dd
        className={
          mono
            ? "mt-2 font-mono text-xs leading-5 break-all"
            : "mt-2 text-sm leading-5 font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}
