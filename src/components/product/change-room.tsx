import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  LockKeyhole,
  Network,
  ShieldCheck,
  Users,
} from "lucide-react";

import { affectedArtifacts, changeEvent } from "@/components/product/demo-data";
import { Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { getOptionalAuthContext } from "@/modules/identity/auth";
import { cn } from "@/lib/utils";

const metadata = [
  ["Change", `${changeEvent.id} (v3.1)`],
  ["Entered by", "Dr. A. Patel · 07/14 10:21 ET"],
  ["Validated by", `${changeEvent.validator} · 07/14 11:03 ET`],
];

const chain = [
  {
    title: "Source change",
    detail: "ACG Clinical Guideline v3.1 · pp. 24-25",
    state: "Validated 07/14 11:03 ET",
    icon: FileText,
  },
  {
    title: "Rule updated",
    detail: "Claim C-77421 (v3.1) · guideline library",
    state: "Propagation complete",
    icon: ClipboardCheck,
  },
  {
    title: "Links propagated",
    detail: "589 inbound links updated across 74 artifacts",
    state: "100% complete",
    icon: Network,
  },
  {
    title: "Artifacts impacted",
    detail: "4 artifacts affected · 2 rewrite · 2 peripheral",
    state: "6 of 8 roles exposed",
    icon: Users,
  },
  {
    title: "Remediation required",
    detail: "Human review and plan authorization required",
    state: "Awaiting authorization",
    icon: ShieldCheck,
  },
];

const personas = ["AP", "JM", "MR", "KO", "DS", "LH"];

export async function ChangeRoom() {
  const auth = await getOptionalAuthContext();

  return (
    <AuthenticatedProductShell
      active="overview"
      eyebrow="Change Room · CE-2026-0714-001"
      title="Change Room"
      description="Inspect this validated source change and its blast radius before authorizing remediation."
      action={
        <div className="space-y-2">
          <Button disabled className="w-full sm:w-auto">
            Authorize remediation plan
          </Button>
          <p className="text-muted-foreground text-xs">
            {auth
              ? "Authenticated session active. This seeded record remains read-only."
              : "Public seeded view: requires WorkOS sign-in and human approval."}
          </p>
        </div>
      }
    >
      <Link
        href="/app/changes"
        className="text-primary focus-visible:ring-ring -mt-4 inline-flex w-fit items-center gap-2 rounded-lg text-sm font-medium focus-visible:ring-3"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden="true" />
        Back to change events
      </Link>

      <Surface className="grid gap-0 p-4 sm:grid-cols-3 sm:p-0">
        {metadata.map(([label, value]) => (
          <div className="border-border py-3 sm:border-r sm:p-6" key={label}>
            <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
              {label}
            </p>
            <p className="mt-2 text-sm font-semibold sm:text-base">{value}</p>
          </div>
        ))}
      </Surface>

      <section className="grid gap-4 lg:grid-cols-[1fr_80px_1fr] lg:items-center">
        <RuleCard tone="old" />
        <div
          className="text-muted-foreground hidden justify-center lg:flex"
          aria-hidden="true"
        >
          <ArrowRight className="size-8" />
        </div>
        <RuleCard tone="new" />
      </section>

      <Surface>
        <div className="border-border border-b px-4 py-3 sm:px-6">
          <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
            Evidence-to-impact chain
          </p>
        </div>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-5">
          {chain.map((item, index) => {
            const Icon = item.icon;
            return (
              <article className="relative space-y-3" key={item.title}>
                {index < chain.length - 1 ? (
                  <ArrowRight
                    className="text-muted-foreground absolute top-5 right-2 hidden size-4 lg:block"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="flex gap-3">
                  <span className="border-border bg-background grid size-10 shrink-0 place-items-center rounded-full border">
                    <Icon className="text-primary size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{item.title}</h2>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      {item.detail}
                    </p>
                    <p
                      className={cn(
                        "mt-2 inline-flex items-center gap-1.5 text-xs font-semibold",
                        item.state.includes("Awaiting")
                          ? "text-warning-foreground"
                          : "text-success",
                      )}
                    >
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      {item.state}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Surface>

      <Surface>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">
              Affected artifacts with linked roles and potential exposure
            </caption>
            <thead className="text-muted-foreground border-border border-b text-xs tracking-[0.12em] uppercase">
              <tr>
                <th className="px-4 py-3 sm:px-6">Artifact</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Impact</th>
                <th className="px-4 py-3">Linked roles / groups</th>
                <th className="px-4 py-3">Potential exposure</th>
              </tr>
            </thead>
            <tbody>
              {affectedArtifacts.slice(0, 4).map((artifact) => (
                <tr
                  className="border-border border-b last:border-0"
                  key={artifact.name}
                >
                  <td className="px-4 py-4 sm:px-6">
                    <p className="font-semibold">{artifact.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {artifact.version}
                    </p>
                  </td>
                  <td className="px-4 py-4">{artifact.type}</td>
                  <td className="px-4 py-4">
                    <StatusPill
                      tone={
                        artifact.impact === "Rewrite required"
                          ? "danger"
                          : "neutral"
                      }
                    >
                      {artifact.impact}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-4">{artifact.owner}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <PersonaStack />
                      <span className="font-semibold">{artifact.exposure}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      <Surface className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_1fr_1fr]">
        <div>
          <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
            Potential exposure key
          </p>
          <PersonaStack labeled />
        </div>
        <div className="border-border lg:border-l lg:pl-6">
          <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
            Exposure defined as
          </p>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Artifacts linked to at least one role or group this reviewer has
            access to, or could be asked to remediate.
          </p>
        </div>
        <div className="border-border lg:border-l lg:pl-6">
          <p className="text-destructive text-sm font-semibold">
            6 of 8 personas potentially exposed
          </p>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            22% of links are uncertain; uncertain links are listed, not hidden.
          </p>
          {auth ? (
            <div className="mt-4 flex items-center gap-2 text-sm font-medium">
              <LockKeyhole className="text-primary size-4" aria-hidden="true" />
              WorkOS authenticated · seeded evidence locked
            </div>
          ) : (
            <Button asChild variant="outline" className="mt-4">
              <Link href="/sign-in">
                <LockKeyhole className="size-4" aria-hidden="true" />
                Sign in with WorkOS
              </Link>
            </Button>
          )}
        </div>
      </Surface>
    </AuthenticatedProductShell>
  );
}

function RuleCard({ tone }: { tone: "old" | "new" }) {
  const isNew = tone === "new";

  return (
    <Surface
      className={cn("p-4 sm:p-6", isNew && "border-success/30 bg-success/10")}
    >
      <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
        {isNew ? "New rule (to)" : "Old rule (from)"}
      </p>
      <p className="mt-4 text-lg leading-8 text-pretty">
        {isNew ? changeEvent.newRule : changeEvent.oldRule}
      </p>
      <p className="text-muted-foreground mt-4 font-mono text-xs">
        {isNew
          ? "v3.1 · 06/30/2026 · claim C-77421"
          : "v3.0 · 12/15/2020 · claim C-55890"}
      </p>
      <p className="text-muted-foreground mt-6 text-xs tracking-[0.12em] uppercase">
        Exact citation
      </p>
      <blockquote className="mt-3 text-sm leading-6">
        “{changeEvent.citation}”
      </blockquote>
      <p className="text-muted-foreground mt-4 font-mono text-xs">
        ACG Clinical Guideline v3.1 · pages 24-25
      </p>
    </Surface>
  );
}

function PersonaStack({ labeled = false }: { labeled?: boolean }) {
  return (
    <div className={cn("flex flex-wrap gap-2", labeled && "mt-4")}>
      {personas.map((persona) => (
        <span
          className="border-warning/40 bg-warning/10 text-warning-foreground grid size-6 place-items-center rounded-full border text-xs font-semibold"
          key={persona}
        >
          {persona}
        </span>
      ))}
      {labeled ? (
        <span className="text-muted-foreground text-xs leading-6">
          Dr. A. Patel · Dr. J. Morgan · Dr. M. Reynolds · Dr. K. Osei
        </span>
      ) : null}
    </div>
  );
}
