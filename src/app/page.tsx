import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";
import { workflowNav } from "@/components/product/product-navigation";
import { Button } from "@/components/ui/button";

const controls = [
  {
    title: "Evidence stays attached",
    detail:
      "Every claim keeps its exact quote, source location, confidence, and reviewed dependency path.",
  },
  {
    title: "People authorize decisions",
    detail:
      "AI extracts and prioritizes. Reviewers validate changes, approve cases, and authorize release.",
  },
  {
    title: "The record stays honest",
    detail:
      "Reports show assigned, assessed, remediated, and rechecked actions without claiming to measure belief.",
  },
] as const;

const dossierRows = [
  ["source", "Anticoagulation guideline · version 4"],
  ["previous rule", "Treat when marker is at least 52."],
  ["current rule", "Hold treatment unless marker is at least 68."],
  ["affected path", "Protocol P-114 → CME module → ICU role"],
  ["next decision", "Validate reviewed dependency paths"],
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main-content">
        <section className="mx-auto flex min-h-[calc(82dvh-4rem)] w-full max-w-7xl flex-col justify-between gap-14 px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end lg:gap-16">
            <div>
              <p className="text-muted-foreground max-w-2xl text-base leading-7">
                Governed change propagation for clinical, quality, and
                compliance teams
              </p>
              <h1 className="mt-5 max-w-5xl text-4xl leading-[1.04] font-semibold text-balance sm:text-6xl">
                Trace a changed rule to every affected decision.
              </h1>
            </div>
            <p className="text-muted-foreground max-w-lg text-base leading-7 lg:pb-2">
              Supersede connects source evidence to dependent claims, artifacts,
              approvals, remediation, and rechecks. The final record shows
              exactly what changed and who authorized it.
            </p>
          </div>

          <div className="border-border grid gap-6 border-y py-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/app/walkthrough">Explore the public case</Link>
            </Button>
            <div className="grid gap-1 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
              <p className="text-muted-foreground">
                Fictional hospital data · read-only · no account required
              </p>
              <Link
                className="focus-visible:ring-ring font-bold underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                href="/app"
              >
                Open the evidence workspace
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="case-title"
          className="border-border bg-card text-card-foreground border-y"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-0 px-4 sm:px-6 lg:grid-cols-[minmax(16rem,0.42fr)_minmax(0,1fr)] lg:px-8">
            <div className="border-border py-12 lg:border-r lg:py-16 lg:pr-14">
              <p className="text-muted-foreground text-sm leading-6">
                Fictional case SMR-2026-114
              </p>
              <h2 id="case-title" className="mt-4 text-3xl font-semibold">
                The threshold moved. The obligation did not stop at the source.
              </h2>
              <p className="text-muted-foreground mt-5 max-w-md text-sm leading-6">
                The public case shows how one revision reaches a protocol,
                training material, affected roles, a correction task, and an
                independently approved audit record.
              </p>
            </div>

            <dl className="divide-border border-border divide-y border-t py-3 lg:border-t-0 lg:py-8 lg:pl-14">
              {dossierRows.map(([label, value]) => (
                <div
                  className="grid gap-2 py-4 text-sm sm:grid-cols-[10rem_1fr] sm:gap-8"
                  key={label}
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd
                    className={
                      label === "previous rule"
                        ? "leading-6 line-through decoration-1"
                        : "leading-6 font-semibold"
                    }
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          id="method"
          aria-labelledby="method-title"
          className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(15rem,0.38fr)_minmax(0,1fr)] lg:gap-20 lg:px-8 lg:py-24"
        >
          <div>
            <h2 id="method-title" className="text-3xl font-semibold">
              One record from evidence to closure.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
              Each workspace answers the next review question. Open any step to
              inspect the seeded case and its evidence.
            </p>
          </div>

          <ol className="border-border border-t">
            {workflowNav.map((item) => (
              <li className="border-border border-b" key={item.key}>
                <Link
                  className="group focus-visible:ring-ring grid gap-2 py-5 focus-visible:ring-3 sm:grid-cols-[3rem_12rem_1fr] sm:items-baseline sm:gap-4"
                  href={item.href}
                >
                  <span className="text-muted-foreground font-mono text-xs tabular-nums sm:pt-1">
                    {item.step === null
                      ? "00"
                      : String(item.step).padStart(2, "0")}
                  </span>
                  <span className="font-heading text-lg font-semibold">
                    {item.label}
                  </span>
                  <span className="text-muted-foreground group-hover:text-foreground text-sm leading-6 transition-colors duration-150">
                    {item.purpose}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="control-title"
          className="border-border border-t"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(15rem,0.38fr)_minmax(0,1fr)] lg:gap-20 lg:px-8 lg:py-24">
            <div>
              <h2 id="control-title" className="text-3xl font-semibold">
                AI works inside the evidence boundary.
              </h2>
            </div>
            <dl className="border-border divide-border divide-y border-y">
              {controls.map((item) => (
                <div
                  className="grid gap-2 py-5 sm:grid-cols-[13rem_1fr] sm:gap-8"
                  key={item.title}
                >
                  <dt className="font-semibold">{item.title}</dt>
                  <dd className="text-muted-foreground text-sm leading-6">
                    {item.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <footer className="border-border border-t">
          <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6 lg:px-8">
            <p className="text-muted-foreground text-sm">
              Supersede · Evidence-backed change propagation
            </p>
            <div className="flex flex-wrap items-center gap-5 text-sm font-bold">
              <Link className="hover:text-primary" href="/app/walkthrough">
                Public case
              </Link>
              <Link className="hover:text-primary" href="/app">
                Workspace
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
