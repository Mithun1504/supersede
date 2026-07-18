import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";
import { workflowNav } from "@/components/product/product-navigation";
import { Button } from "@/components/ui/button";

const assurances = [
  {
    title: "Evidence remains inspectable",
    detail:
      "Claims keep their exact quote, source location, confidence, and reviewed dependency path.",
  },
  {
    title: "People authorize the record",
    detail:
      "AI proposes and prioritizes. Reviewers validate changes, approve cases, and authorize release.",
  },
  {
    title: "Outcomes stay observable",
    detail:
      "The audit trail reports only assigned, assessed, remediated, and rechecked actions.",
  },
] as const;

const dossierRows = [
  ["superseded rule", "Treat when marker is at least 52."],
  ["current rule", "Hold treatment unless marker is at least 68."],
  ["next obligation", "Validate dependency paths"],
  ["release condition", "Independent approval"],
  ["evidence state", "Version locked"],
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main-content">
        <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div
            aria-label="Fictional governed change dossier"
            className="bg-card text-card-foreground border-border border-y"
          >
            <div className="border-border grid gap-6 border-b px-5 py-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-10">
              <div>
                <p className="text-muted-foreground text-sm leading-6">
                  Governed change dossier · fictional clinical example ·
                  read-only public demo
                </p>
                <h1 className="mt-5 max-w-4xl text-3xl leading-tight font-semibold text-balance sm:text-5xl lg:text-6xl">
                  When the rule changes, show what changed with it.
                </h1>
              </div>
              <dl className="border-border grid content-start border-t pt-4 text-sm sm:grid-cols-3 lg:grid-cols-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
                <div className="pb-3 sm:pr-4 lg:pr-0">
                  <dt className="text-muted-foreground">status</dt>
                  <dd className="mt-1 font-semibold">review in progress</dd>
                </div>
                <div className="border-border py-3 sm:border-l sm:px-4 lg:border-t lg:border-l-0 lg:px-0">
                  <dt className="text-muted-foreground">record</dt>
                  <dd className="mt-1 font-mono text-xs tabular-nums">
                    SMR-2026-114
                  </dd>
                </div>
                <div className="border-border pt-3 sm:border-l sm:pl-4 lg:border-t lg:border-l-0 lg:pl-0">
                  <dt className="text-muted-foreground">demo boundary</dt>
                  <dd className="mt-1 font-semibold">fictional data only</dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="border-border px-5 py-6 sm:px-8 lg:border-r lg:px-10 lg:py-8">
                <p className="max-w-2xl text-lg leading-8">
                  Supersede follows one source revision through its claims,
                  artifacts, approvals, and closure checks. The product shows
                  the reviewer what is proven, what is blocked, and which record
                  can be exported.
                </p>
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <Link href="/app/walkthrough">Open the demo guide</Link>
                  </Button>
                  <p className="text-muted-foreground text-sm leading-6">
                    Or{" "}
                    <Link
                      className="text-foreground hover:text-primary focus-visible:ring-ring font-semibold transition-colors duration-150 focus-visible:ring-3 focus-visible:outline-none"
                      href="/app"
                    >
                      enter the workspace
                    </Link>{" "}
                    to inspect the seeded record.
                  </p>
                </div>
              </div>

              <div className="border-border border-t px-5 py-6 sm:px-8 lg:border-t-0 lg:px-10 lg:py-8">
                <h2 className="text-2xl font-semibold">
                  Updated treatment threshold
                </h2>
                <dl className="divide-border mt-5 divide-y border-y">
                  {dossierRows.map(([label, value]) => (
                    <div
                      className="grid gap-2 py-3 text-sm sm:grid-cols-[11rem_1fr] sm:gap-8"
                      key={label}
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd
                        className={
                          label === "superseded rule"
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
            </div>
          </div>
        </section>

        <section
          id="method"
          aria-labelledby="method-title"
          className="border-border border-y"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(15rem,0.42fr)_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-20">
            <div className="lg:pt-5">
              <h2 id="method-title" className="text-3xl font-semibold">
                Follow the change, not the menu.
              </h2>
              <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
                Every surface sits in the order a reviewer uses it. The control
                room shows the active dossier; the numbered workflow moves from
                source evidence to an exportable audit trail.
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
          </div>
        </section>

        <section
          aria-labelledby="record-title"
          className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(15rem,0.45fr)_minmax(0,1fr)] lg:gap-20">
            <div>
              <h2 id="record-title" className="text-3xl font-semibold">
                A record, not a prediction.
              </h2>
            </div>
            <dl className="border-border divide-border divide-y border-y">
              {assurances.map((item) => (
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
              <Link
                className="hover:text-primary transition-colors duration-150"
                href="/app/walkthrough"
              >
                Demo guide
              </Link>
              <Link
                className="hover:text-primary transition-colors duration-150"
                href="/app"
              >
                Workspace
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
