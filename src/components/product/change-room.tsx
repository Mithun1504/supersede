import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  FileText,
  GitCommitHorizontal,
  Network,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";

import { Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { SplitRule, WorkflowRail } from "@/components/product/product-ui";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export async function ChangeRoom() {
  const data = await getProductWorkspace();
  const artifacts = data.impacts.filter((impact) => impact.artifactId);
  const chain = [
    {
      title: "Source change",
      detail: `${data.change.sourceTitle} ${data.change.newSourceVersionLabel}`,
      value: data.change.validatedAt ? "Validated" : "Awaiting validation",
      icon: FileText,
    },
    {
      title: "Claims reviewed",
      detail: `${data.claims.length} current claim versions`,
      value: `${data.claims.filter((claim) => claim.reviewStatus === "reviewed").length} reviewed`,
      icon: ClipboardCheck,
    },
    {
      title: "Links propagated",
      detail: `${data.impacts.length} impact paths`,
      value: `${data.impacts.filter((impact) => impact.confidence < 0.6).length} uncertain`,
      icon: Network,
    },
    {
      title: "Artifacts impacted",
      detail: `${artifacts.length} version-locked artifacts`,
      value: `${data.exposures.length} role links`,
      icon: Users,
    },
    {
      title: "Remediation",
      detail: `${data.probes.filter((probe) => probe.remediationAssignmentId).length} assigned`,
      value: `${data.probes.filter((probe) => probe.remediationStatus === "passed").length} passed`,
      icon: ShieldCheck,
    },
  ];
  return (
    <AuthenticatedProductShell
      active="overview"
      eyebrow={`Change Room · ${data.change.reference}`}
      title="Change Room"
      description="Inspect the validated source change and its current downstream state."
      action={
        <Button asChild>
          <Link href="/app/blast-radius">
            Inspect blast radius
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      <Link
        href="/app/changes"
        className="text-primary inline-flex w-fit items-center gap-2 text-sm font-medium"
      >
        <ArrowRight className="size-4 rotate-180" />
        Back to change events
      </Link>
      <Surface className="grid gap-2 overflow-hidden p-2 sm:grid-cols-3">
        {[
          {
            label: "Change",
            value: `${data.change.reference} (${data.change.versionLabel})`,
            icon: GitCommitHorizontal,
            tone: "text-primary",
          },
          {
            label: "Entered by",
            value: `${data.change.enteredBy} · ${formatDate(data.change.enteredAt)}`,
            icon: CalendarClock,
            tone: "text-chart-2",
          },
          {
            label: "Validated by",
            value: data.change.validatedBy
              ? `${data.change.validatedBy} · ${formatDate(data.change.validatedAt)}`
              : "Pending",
            icon: UserRoundCheck,
            tone: "text-success",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div
            className={`border-border/70 bg-card flex min-w-0 items-start gap-3 rounded-lg border p-4 ${tone}`}
            key={label}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-current/15 bg-current/5">
              <Icon className="size-4" />
            </span>
            <div className="text-foreground min-w-0">
              <p className="data-label">{label}</p>
              <p className="mt-1.5 text-sm font-semibold">{value}</p>
            </div>
          </div>
        ))}
      </Surface>
      <Surface className="relative grid overflow-hidden lg:grid-cols-2">
        <SplitRule
          label="Old rule (from)"
          text={data.change.oldRule}
          detail={`${data.change.oldSourceVersionLabel} · ${data.change.oldEffectiveDate}`}
        />
        <span className="border-border bg-card absolute top-1/2 left-1/2 z-10 hidden size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border shadow-sm lg:grid">
          <ArrowRight className="size-4" />
        </span>
        <SplitRule
          label="New rule (to)"
          text={data.change.newRule}
          detail={`${data.change.newSourceVersionLabel} · ${data.change.newEffectiveDate}`}
          current
        />
      </Surface>
      <Surface>
        <div className="border-border border-b px-4 py-3 sm:px-6">
          <p className="text-muted-foreground text-xs uppercase">
            Evidence-to-impact chain
          </p>
        </div>
        <div className="p-4 sm:p-6">
          <WorkflowRail
            steps={chain.map((item, index) => ({
              ...item,
              state:
                index === chain.length - 1
                  ? ("current" as const)
                  : ("complete" as const),
            }))}
          />
        </div>
      </Surface>
      <Surface>
        <div className="scrollbar-subtle overflow-x-auto" tabIndex={0}>
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground border-border hidden border-b text-xs uppercase md:table-header-group">
              <tr>
                <th className="px-6 py-3">Artifact</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Impact</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Exposure</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map((impact) => {
                const exposures = data.exposures.filter(
                  (item) => item.artifactVersionId === impact.objectId,
                );
                return (
                  <tr
                    className="border-border/70 content-auto hover:bg-muted/35 grid border-b p-4 transition-colors last:border-0 md:table-row md:p-0"
                    key={impact.id}
                  >
                    <td className="py-2 md:px-6 md:py-4">
                      <p className="font-semibold">{impact.artifactTitle}</p>
                      <p className="text-muted-foreground text-xs">
                        {impact.artifactVersionLabel}
                      </p>
                    </td>
                    <td className="text-muted-foreground py-1 text-xs md:px-4 md:py-4 md:text-sm">
                      {impact.artifactKind}
                    </td>
                    <td className="py-2 md:px-4 md:py-4">
                      <StatusPill
                        tone={
                          impact.rewriteRequired === "yes"
                            ? "danger"
                            : "neutral"
                        }
                      >
                        {impact.rewriteRequired === "yes"
                          ? "Rewrite required"
                          : impact.kind.replaceAll("_", " ")}
                      </StatusPill>
                    </td>
                    <td className="py-1 text-sm md:px-4 md:py-4">
                      {impact.artifactOwner ?? "Unassigned"}
                    </td>
                    <td className="text-muted-foreground py-1 text-xs md:px-4 md:py-4 md:text-sm">
                      {exposures.reduce(
                        (sum, item) => sum + item.peopleCount,
                        0,
                      )}{" "}
                      people ·{" "}
                      {exposures.map((item) => item.roleName).join(", ") ||
                        "No role"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Surface>
    </AuthenticatedProductShell>
  );
}
function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Pending";
}
