import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ClipboardList,
  Quote,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";

import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { MetricRail } from "@/components/product/product-ui";
import { ConfidenceBar, StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export const metadata: Metadata = { title: "Blast Radius" };

export default async function BlastRadiusPage() {
  const data = await getProductWorkspace();
  const artifacts = data.impacts.filter((impact) => impact.artifactId);
  const people = data.exposures.reduce(
    (sum, exposure) => sum + exposure.peopleCount,
    0,
  );
  const metrics = [
    [
      "Affected artifacts",
      artifacts.length,
      `${artifacts.filter((x) => x.rewriteRequired === "yes").length} require rewrite`,
    ],
    ["Linked roles", data.exposures.length, "Role-to-artifact exposure links"],
    ["Potential people", people, "Distinct memberships may overlap"],
    [
      "Divergence cases",
      data.cases.length,
      `${data.cases.filter((x) => x.status === "approved").length} approved`,
    ],
  ] as const;
  const selected = artifacts[0];
  return (
    <AuthenticatedProductShell
      active="blast-radius"
      eyebrow="Blast radius"
      title="Blast radius"
      description="Potential exposure across artifacts, roles, and people based on validated propagation paths."
      action={
        <Button asChild>
          <Link href="/app/cases">
            View divergence cases
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      <MetricRail
        items={metrics.map(([label, value, detail], index) => ({
          label,
          value,
          detail,
          icon: [Target, Users, ShieldAlert, ClipboardList][index],
          tone: (["primary", "cyan", "warning", "success"] as const)[index],
        }))}
      />
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Surface className="min-w-0 overflow-hidden">
          <SectionTitle
            title="Propagation paths"
            detail="Every row is read from the current ChangeEvent impact records."
          />
          <div className="flex flex-col gap-3 p-4 sm:p-6">
            {artifacts.map((impact) => {
              const exposure = data.exposures.find(
                (item) => item.artifactVersionId === impact.objectId,
              );
              return (
                <article
                  className="border-border/70 bg-card/45 hover:bg-card hover:border-primary/25 grid gap-4 rounded-xl border p-4 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(83,50,160,0.05)] sm:p-5 lg:grid-cols-[minmax(0,1fr)_220px_160px]"
                  key={impact.id}
                >
                  <div>
                    <p className="text-muted-foreground font-mono text-[10px] font-semibold uppercase">
                      {impact.artifactKind}
                    </p>
                    <h3 className="text-foreground mt-1.5 text-sm leading-snug font-semibold sm:text-base">
                      {impact.artifactTitle}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {impact.artifactOwner ?? "Unassigned"} ·{" "}
                      {impact.artifactVersionLabel}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <StatusPill
                      tone={
                        impact.rewriteRequired === "yes"
                          ? "danger"
                          : impact.rewriteRequired === "candidate"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {impact.rewriteRequired === "yes"
                        ? "Rewrite required"
                        : impact.rewriteRequired === "candidate"
                          ? "Review candidate"
                          : "No rewrite"}
                    </StatusPill>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {exposure
                        ? `${exposure.peopleCount} people · ${exposure.roleName}`
                        : "No linked role"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ConfidenceBar
                      value={Math.round(impact.confidence * 100)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </Surface>
        <Surface className="h-fit overflow-hidden xl:sticky xl:top-24">
          <SectionTitle
            title="Selected path"
            detail="Evidence from the highest-confidence impact."
          />
          <div className="space-y-4 p-4 sm:p-6">
            <h2 className="font-semibold">
              {selected?.artifactTitle ?? "No active impact"}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {selected?.rationale}
            </p>
            <div className="border-border bg-muted/30 rounded-xl border p-4">
              <Quote className="text-primary size-4" />
              <blockquote className="mt-3 text-sm leading-6">
                “{data.claims[0]?.evidenceQuote ?? data.change.newRule}”
              </blockquote>
            </div>
          </div>
        </Surface>
      </section>
    </AuthenticatedProductShell>
  );
}
