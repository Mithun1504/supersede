import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  GitCompareArrows,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Divergence Cases" };
export default async function CasesPage() {
  const data = await getProductWorkspace();
  return (
    <AuthenticatedProductShell
      active="cases"
      eyebrow="Divergence cases"
      title="Divergence cases"
      description="Versioned cases compare the retired and current answer; only approved versions can reach learners."
      action={
        <Button asChild>
          <Link href="/app/probes">
            Open probes
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4">
        {data.cases.map((item) => (
          <Surface key={item.versionId} className="overflow-hidden">
            <div className="p-4 sm:p-6">
              <div className="flex justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{item.scenario}</h2>
                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {item.id.slice(0, 8)} · {item.versionLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <LockKeyhole
                    className="text-muted-foreground size-4"
                    aria-label="Version locked"
                  />
                  <StatusPill
                    tone={
                      item.status === "approved"
                        ? "success"
                        : item.status === "retired"
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {item.status}
                  </StatusPill>
                </div>
              </div>
              <div className="relative mt-5 grid overflow-hidden rounded-xl border lg:grid-cols-2">
                <Answer label="Old answer" text={item.oldAnswer} />
                <Answer
                  label="New answer"
                  text={item.newAnswer}
                  approved={item.status === "approved"}
                />
                <span className="border-border bg-card absolute top-1/2 left-1/2 z-10 hidden size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border shadow-sm lg:grid">
                  <GitCompareArrows className="text-primary size-4" />
                </span>
              </div>
              <p className="text-muted-foreground mt-4 text-sm">
                Authored by {item.author}
                {item.approver
                  ? ` · approved by ${item.approver}`
                  : " · awaiting approval"}
              </p>
              {item.ambiguityNote ? (
                <p className="text-warning-foreground mt-3 text-sm">
                  {item.ambiguityNote}
                </p>
              ) : null}
            </div>
            <div className="border-border/70 bg-muted/20 grid gap-4 border-t p-4 sm:grid-cols-3 sm:p-6">
              <CaseFact label="Rationale" value={item.rationale} />
              <CaseFact
                label="Old rule citation"
                value={citationSummary(item.oldCitation)}
              />
              <CaseFact
                label="New rule citation"
                value={citationSummary(item.newCitation)}
              />
            </div>
            <div className="border-border/70 flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-muted-foreground inline-flex items-center gap-2 text-xs">
                <ShieldCheck className="text-success size-4" /> Approval
                invariant: only approved, version-locked cases can reach probes.
              </p>
              <p className="text-muted-foreground text-xs">
                Different approved cases are required for 30/90-day rechecks.
              </p>
            </div>
          </Surface>
        ))}
      </div>
    </AuthenticatedProductShell>
  );
}
function Answer({
  label,
  text,
  approved = false,
}: {
  label: string;
  text: string;
  approved?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative min-h-40 overflow-hidden p-5 sm:p-6",
        approved ? "bg-success/5" : "bg-destructive/[0.035]",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 w-1",
          approved ? "bg-success left-0" : "bg-destructive/65 right-0",
        )}
      />
      <span
        className={cn(
          "w-fit rounded-md px-2 py-1 text-[10px] font-semibold tracking-wider uppercase",
          approved
            ? "bg-success/12 dark:text-success text-[oklch(0.32_0.09_165)]"
            : "bg-destructive/10 dark:text-destructive text-[oklch(0.42_0.16_25)]",
        )}
      >
        {label}
      </span>
      <p className="font-heading text-foreground mt-5 text-base leading-relaxed font-semibold">
        {text}
      </p>
    </div>
  );
}

function CaseFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="data-label">{label}</p>
      <p className="text-muted-foreground mt-2 text-xs leading-5">{value}</p>
    </div>
  );
}

function citationSummary(citation: Record<string, unknown>) {
  const values = Object.values(citation).filter(
    (value): value is string | number =>
      typeof value === "string" || typeof value === "number",
  );
  return values.length
    ? values.join(" · ")
    : "Citation retained in the version-locked record";
}
