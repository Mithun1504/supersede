import type { Metadata } from "next";
import {
  CheckCircle2,
  ClipboardList,
  Download,
  RefreshCw,
  Send,
} from "lucide-react";
import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { MetricRail } from "@/components/product/product-ui";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export const metadata: Metadata = { title: "Audit" };
export default async function AuditPage() {
  const data = await getProductWorkspace();
  const stages = [
    ["Assigned", data.probes.length, "Persisted probe assignments"],
    [
      "Assessed",
      data.probes.filter((probe) => probe.responseId).length,
      "Persisted responses",
    ],
    [
      "Remediated",
      data.probes.filter((probe) => probe.remediationStatus === "passed")
        .length,
      "Passed remediation assignments",
    ],
    [
      "Rechecked",
      data.probes.reduce((sum, probe) => sum + probe.recheckCompleted, 0),
      "Completed different-case rechecks",
    ],
  ] as const;
  return (
    <AuthenticatedProductShell
      active="audit"
      eyebrow="Audit"
      title="Audit"
      description="Observable outcomes, append-only records, and a verifiable export generated from the current tenant data."
      action={
        <Button asChild variant="outline">
          <a href="/api/v1/public/walkthrough/audit-export" download>
            <Download className="size-4" />
            Download checksummed bundle
          </a>
        </Button>
      }
    >
      <MetricRail
        connected
        items={stages.map(([label, value, detail], index) => ({
          label,
          value,
          detail,
          icon: [Send, ClipboardList, CheckCircle2, RefreshCw][index],
          tone: (["primary", "cyan", "success", "warning"] as const)[index],
        }))}
      />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface className="min-w-0">
          <SectionTitle
            title="Append-only log"
            detail={`${data.timeline.length} events currently linked to ${data.change.reference}.`}
            action={
              <div className="border-border bg-muted/50 flex rounded-lg border p-1 text-xs">
                <span className="bg-card rounded-md px-3 py-1.5 font-semibold shadow-sm">
                  Audit events
                </span>
                <span className="text-muted-foreground px-3 py-1.5">
                  Approval records · {data.approvals.length}
                </span>
              </div>
            }
          />
          <div className="scrollbar-subtle overflow-x-auto" tabIndex={0}>
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground border-border hidden border-b text-xs uppercase md:table-header-group">
                <tr>
                  <th className="px-4 py-3 sm:px-6">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Object</th>
                </tr>
              </thead>
              <tbody>
                {data.timeline.map((event) => (
                  <tr
                    className="border-border/70 content-auto hover:bg-muted/35 grid gap-1 border-b p-4 transition-colors last:border-0 md:table-row md:p-0"
                    key={event.id}
                  >
                    <td className="py-1 font-mono text-xs md:px-4 md:py-4 md:text-sm md:first:px-6">
                      {new Date(event.occurredAt).toLocaleString()}
                    </td>
                    <td className="py-1 font-medium md:px-4 md:py-4">
                      {event.actor}
                    </td>
                    <td className="py-1 md:px-4 md:py-4">
                      {event.eventType.replaceAll("_", " ")}
                    </td>
                    <td className="text-muted-foreground py-1 font-mono text-xs md:px-4 md:py-4">
                      {event.objectType} · {event.objectId.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-border flex justify-between gap-3 border-t p-4 sm:px-6">
            <p className="text-muted-foreground text-xs">
              {data.approvals.length} governed approvals · {data.reports.length}{" "}
              stored report bundles
            </p>
            <StatusPill tone="warning">
              Standard retention · not WORM
            </StatusPill>
          </div>
        </Surface>
        <Surface className="h-fit overflow-hidden xl:sticky xl:top-24">
          <SectionTitle
            title="Export verification"
            detail="Verify the governed bundle before release."
          />
          <dl className="divide-border/70 divide-y p-5 text-sm">
            <Verification
              label="Report cutoff"
              value={
                data.reports[0]
                  ? new Date(data.reports[0].cutoffAt).toLocaleString()
                  : "No stored bundle"
              }
            />
            <Verification
              label="SHA-256 checksum"
              value={data.reports[0]?.sha256 ?? "Unavailable"}
              mono
            />
            <Verification
              label="Retention mode"
              value="Standard retention · not WORM"
            />
          </dl>
          <div className="border-border/70 border-t p-5">
            <p className="data-label">Governed approvals</p>
            <div className="mt-3 space-y-2">
              {data.approvals.length ? (
                data.approvals.slice(0, 3).map((approval) => (
                  <p
                    className="text-muted-foreground text-xs"
                    key={approval.id}
                  >
                    <span className="text-foreground font-medium">
                      {approval.action.replaceAll("_", " ")}
                    </span>{" "}
                    · {approval.actor}
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground text-xs">
                  No governed approvals linked.
                </p>
              )}
            </div>
          </div>
        </Surface>
      </section>
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
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="data-label">{label}</dt>
      <dd
        className={
          mono ? "mt-2 font-mono text-xs break-all" : "mt-2 text-sm font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}
