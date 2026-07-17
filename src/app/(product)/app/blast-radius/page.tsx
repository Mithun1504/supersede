import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Quote } from "lucide-react";

import {
  affectedArtifacts,
  changeEvent,
  metrics,
} from "@/components/product/demo-data";
import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { ConfidenceBar, StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Blast Radius",
};

export default function BlastRadiusPage() {
  return (
    <AuthenticatedProductShell
      active="blast-radius"
      eyebrow="Blast radius"
      title="Blast radius"
      description="Potential exposure across protocols, roles, and groups based on validated change propagation paths."
      action={
        <Button asChild>
          <Link
            href="/app/cases"
            data-product-action="approve-divergence-cases"
          >
            Approve divergence cases
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Surface className="p-4" key={metric.label}>
            <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
              {metric.label}
            </p>
            <p className="mt-2 text-3xl font-semibold">{metric.value}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {metric.detail}
            </p>
          </Surface>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Surface>
          <SectionTitle
            title="Propagation paths"
            detail="Rows stay visible even when confidence is low or links are uncertain."
          />
          <div className="divide-border divide-y">
            {affectedArtifacts.map((artifact) => (
              <article
                className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_240px_160px]"
                key={artifact.name}
              >
                <div className="min-w-0">
                  <p className="text-muted-foreground font-mono text-xs">
                    Claim C-77421
                  </p>
                  <h2 className="mt-1 text-base font-semibold">
                    {artifact.name}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {artifact.owner} · {artifact.version}
                  </p>
                </div>
                <div>
                  <StatusPill
                    tone={
                      artifact.impact === "Rewrite required"
                        ? "danger"
                        : artifact.impact === "Peripheral edits"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {artifact.impact}
                  </StatusPill>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {artifact.exposure} personas
                  </p>
                </div>
                <ConfidenceBar value={artifact.confidence} />
              </article>
            ))}
          </div>
        </Surface>
        <Surface>
          <SectionTitle
            title="Selected path"
            detail="Claim to protocol to role."
          />
          <div className="space-y-5 p-4 sm:p-6">
            {[
              "Source claim",
              "GI Bleed Management Protocol",
              "Order Set: Upper GI Bleed",
            ].map((node) => (
              <div className="border-border rounded-lg border p-3" key={node}>
                <p className="font-semibold">{node}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Version-locked evidence path.
                </p>
              </div>
            ))}
            <div className="border-border rounded-lg border p-4">
              <Quote className="text-primary size-4" aria-hidden="true" />
              <blockquote className="mt-3 text-sm leading-6">
                “{changeEvent.citation}”
              </blockquote>
            </div>
            <StatusPill tone="danger">Highest impact</StatusPill>
          </div>
        </Surface>
      </section>
    </AuthenticatedProductShell>
  );
}
