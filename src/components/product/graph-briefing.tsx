import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  MoreVertical,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";

import { changeEvent } from "@/components/product/demo-data";
import { Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { ConfidenceBar, StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOptionalAuthContext } from "@/modules/identity/auth";

const columns = [
  {
    label: "Change (source)",
    nodes: [
      {
        title: "High-dose IV PPI timing clarification for NVUGIB",
        meta: "v3.1 · 06/30/2026",
        tone: "success",
      },
    ],
  },
  {
    label: "Claims",
    nodes: [
      {
        title: "C-77421 · High-dose IV PPI as soon as possible after endoscopy",
        meta: "v3.1 · 68%",
        tone: "impacted",
      },
      {
        title: "C-55122 · Pre-endoscopy PPI bolus required for all UGIB",
        meta: "v2.4 · 54%",
        tone: "rewrite",
      },
      {
        title: "C-55890 · Transition to oral PPI within 72 hours if stable",
        meta: "v3.0 · 72%",
        tone: "impacted",
      },
      {
        title: "C-62011 · PPI indicated for suspected variceal bleeding",
        meta: "v2.1 · 42%",
        tone: "uncertain",
      },
    ],
  },
  {
    label: "Protocols",
    nodes: [
      {
        title: "P-8890 · GI Bleed Management Protocol",
        meta: "v5.5 · Published",
        tone: "impacted",
      },
      {
        title: "P-7721 · Upper GI Bleed (Adult) Order Set",
        meta: "v4.1 · Active",
        tone: "rewrite",
      },
      {
        title: "P-5512 · ED Provider Job Aid",
        meta: "v2.2 · Active",
        tone: "impacted",
      },
      {
        title: "P-2201 · PPI Dosing Reference",
        meta: "v1.4 · Draft",
        tone: "uncertain",
      },
    ],
  },
  {
    label: "Roles / groups",
    nodes: [
      {
        title: "Gastroenterologist",
        meta: "48 people · 84%",
        tone: "impacted",
      },
      { title: "Hospitalist", meta: "62 people · 76%", tone: "impacted" },
      { title: "Nurse (ED)", meta: "134 people · 71%", tone: "impacted" },
      { title: "ED Physician", meta: "110 people · 71%", tone: "impacted" },
      { title: "APP", meta: "86 people · 55%", tone: "impacted" },
      { title: "Pharmacist", meta: "27 people · 55%", tone: "uncertain" },
      { title: "Resident", meta: "14 people · 41%", tone: "uncertain" },
    ],
  },
] as const;

const evidence = [
  {
    title: "GI Bleed Management Protocol v5.5",
    detail: "action: initiate high-dose IV PPI immediately after endoscopy.",
    ref: "p. 3",
  },
  {
    title: "Order Set: Upper GI Bleed (Adult) v4.1",
    detail: "Includes high-dose IV PPI timing step in post-endoscopy phase.",
    ref: "step 4",
  },
];

export async function GraphBriefing() {
  const auth = await getOptionalAuthContext();

  return (
    <AuthenticatedProductShell
      active="graph"
      eyebrow="Blast radius · St. Marlowe Health · CE-2026-0714-001"
      title="Graph Briefing"
      description="Investigating the downstream impact of a guideline change."
      action={
        <Button asChild variant="outline">
          <Link href="/app/changes">
            View change record
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Surface className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm">
                Show: All downstream paths
              </Button>
              <LegendDot label="Impacted" tone="impacted" count="6" />
              <LegendDot label="Rewrite required" tone="rewrite" count="2" />
              <LegendDot label="Uncertain" tone="uncertain" count="2" />
              <LegendDot label="No impact" tone="neutral" count="0" />
            </div>
            <Button variant="outline" size="icon" aria-label="Graph filters">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </Surface>

          <Surface className="min-w-0 overflow-hidden">
            <div
              className="overflow-x-auto p-4 sm:p-6"
              tabIndex={0}
              aria-label="Dependency graph columns"
            >
              <div className="grid min-w-[980px] grid-cols-[160px_1fr_1fr_1fr] gap-6">
                {columns.map((column, columnIndex) => (
                  <div className="space-y-4" key={column.label}>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-muted-foreground text-xs">
                        {column.label}
                      </p>
                      {columnIndex < columns.length - 1 ? (
                        <ArrowRight
                          className="text-muted-foreground size-4"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      {column.nodes.map((node) => (
                        <GraphNode
                          key={node.title}
                          title={node.title}
                          meta={node.meta}
                          tone={node.tone}
                          compact={columnIndex === 0}
                          person={columnIndex === columns.length - 1}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <GraphLegend />
          </Surface>
          <p className="text-muted-foreground text-sm">
            8 potential exposure · 6 impacted · 2 rewrite required · 2 uncertain
          </p>
        </div>

        <SelectedPathPanel authenticated={Boolean(auth)} />
      </section>
    </AuthenticatedProductShell>
  );
}

function SelectedPathPanel({ authenticated }: { authenticated: boolean }) {
  return (
    <Surface className="xl:sticky xl:top-24 xl:self-start">
      <div className="border-border flex items-start justify-between gap-4 border-b p-4 sm:p-6">
        <div>
          <p className="text-sm font-semibold">Selected path</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Change › Claim › Protocol › Role
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close selected path">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="text-base leading-6 font-semibold">
            High-dose IV PPI timing clarification for NVUGIB &gt; GI Bleed
            Management Protocol &gt; Gastroenterologist
          </h2>
          <StatusPill tone="plum">Impacted</StatusPill>
        </div>

        <EvidenceQuote />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="border-border rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">Confidence</p>
            <div className="mt-3">
              <ConfidenceBar value={68} />
            </div>
            <p className="text-warning-foreground mt-2 text-xs font-semibold">
              Moderate
            </p>
          </div>
          <div className="border-border rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">Path rationale</p>
            <p className="mt-2 text-sm leading-6">
              Protocol cites the claim as required action in first-line
              management.
            </p>
          </div>
        </section>

        <section className="border-border border-t pt-5">
          <p className="text-sm font-semibold">Classification</p>
          <div className="mt-3 flex items-start gap-3">
            <StatusPill tone="plum">Impacted</StatusPill>
            <p className="text-muted-foreground text-sm leading-6">
              Downstream content is consistent with the new rule but should be
              reviewed.
            </p>
          </div>
        </section>

        <section className="border-border border-t pt-5">
          <p className="text-sm font-semibold">Evidence</p>
          <p className="text-muted-foreground mt-1 text-xs">
            2 supporting links
          </p>
          <div className="mt-3 divide-y overflow-hidden rounded-lg border">
            {evidence.map((item) => (
              <article
                className="border-border flex items-start gap-3 p-3"
                key={item.title}
              >
                <FileText
                  className="text-primary mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {item.detail}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">
                  {item.ref}
                </span>
                <MoreVertical
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
              </article>
            ))}
          </div>
        </section>

        <section className="border-border border-t pt-5">
          <p className="text-sm font-semibold">Reviewer action</p>
          <Button disabled className="mt-3 w-full">
            <Check className="size-4" aria-hidden="true" />
            Confirm reviewed edge
          </Button>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {authenticated
              ? "This seeded edge remains read-only. Live edge acceptance requires a tenant reviewer and records a governed approval."
              : "Public seeded view is read-only. Human review actions require WorkOS sign-in and a reviewer role."}
          </p>
          {authenticated ? (
            <p className="text-primary mt-3 text-sm font-medium">
              WorkOS authenticated · seeded evidence locked
            </p>
          ) : (
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link href="/sign-in">Sign in with WorkOS</Link>
            </Button>
          )}
        </section>

        <p className="text-muted-foreground text-xs">
          Reviewed by Dr. A. Patel · July 15, 2026 at 10:15 AM ET
        </p>
      </div>
    </Surface>
  );
}

function EvidenceQuote() {
  return (
    <figure className="border-border rounded-lg border p-4">
      <figcaption className="text-muted-foreground text-xs">
        Exact quote
      </figcaption>
      <blockquote className="mt-3 text-base leading-8 font-medium text-pretty italic">
        “{changeEvent.citation}”
      </blockquote>
      <p className="text-muted-foreground mt-4 font-mono text-xs">
        ACG Clinical Guideline v3.1 · pages 24-25
      </p>
    </figure>
  );
}

function GraphNode({
  title,
  meta,
  tone,
  compact,
  person,
}: {
  title: string;
  meta: string;
  tone: (typeof columns)[number]["nodes"][number]["tone"];
  compact?: boolean;
  person?: boolean;
}) {
  return (
    <article
      className={cn(
        "bg-card rounded-lg border p-3 shadow-[0_1px_0_oklch(0.2_0.03_315/0.06)]",
        compact ? "min-h-28" : "min-h-20",
        tone === "success" && "border-success/40",
        tone === "impacted" && "border-primary/70",
        tone === "rewrite" && "border-destructive/70",
        tone === "uncertain" && "border-warning border-dashed",
      )}
    >
      <div className="flex gap-3">
        {person ? (
          <span className="border-border bg-background grid size-8 shrink-0 place-items-center rounded-full border">
            <UserRound className="text-muted-foreground size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm leading-6 font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-2 text-xs">{meta}</p>
          {tone === "success" ? (
            <StatusPill tone="success">Validated</StatusPill>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LegendDot({
  label,
  tone,
  count,
}: {
  label: string;
  tone: "impacted" | "rewrite" | "uncertain" | "neutral";
  count?: string;
}) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-2 text-xs">
      <span
        className={cn(
          "h-1.5 w-6 rounded-full",
          tone === "impacted" && "bg-primary",
          tone === "rewrite" && "bg-destructive",
          tone === "uncertain" && "bg-warning",
          tone === "neutral" && "bg-muted-foreground/40",
        )}
      />
      {label}
      {count ? (
        <span className="bg-muted text-muted-foreground rounded-full px-1.5">
          {count}
        </span>
      ) : null}
    </span>
  );
}

function GraphLegend() {
  return (
    <div className="border-border m-4 grid gap-4 rounded-lg border p-4 sm:m-6 sm:grid-cols-2 lg:grid-cols-4">
      <LegendDot label="Impacted" tone="impacted" count="" />
      <p className="text-muted-foreground text-xs leading-5">
        Downstream content likely requires review.
      </p>
      <LegendDot label="Rewrite required" tone="rewrite" count="" />
      <p className="text-muted-foreground text-xs leading-5">
        Content conflicts with the new rule and must change.
      </p>
      <LegendDot label="Uncertain link" tone="uncertain" count="" />
      <p className="text-muted-foreground text-xs leading-5">
        Evidence is incomplete or confidence is low.
      </p>
      <LegendDot label="No impact" tone="neutral" count="" />
      <p className="text-muted-foreground text-xs leading-5">
        No dependency on this change.
      </p>
    </div>
  );
}
