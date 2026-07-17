import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const foundations = [
  {
    title: "Evidence stays attached",
    description:
      "Every claim, impact, and case keeps its exact quote, confidence, and versioned source.",
  },
  {
    title: "Humans authorize",
    description:
      "AI prioritizes review. It never validates a change, approves a case, or authorizes a release.",
  },
  {
    title: "Audit without euphemism",
    description:
      "Reports state what was assigned, assessed, remediated, and rechecked—nothing inferred.",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-28">
          <div className="space-y-6">
            <Badge variant="secondary">Governed change propagation</Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold text-balance sm:text-6xl">
                Version control for organizational knowledge.
              </h1>
              <p className="text-muted-foreground max-w-2xl text-lg leading-8 text-pretty">
                Trace a changed rule through the artifacts and people who may
                act on it, then prove review, remediation, and release with
                version-locked evidence.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/app/walkthrough">
                  Open public walkthrough
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/app">Open workspace</Link>
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>What the walkthrough proves</CardTitle>
              <CardDescription>
                Fictional hospital data, explicit seeded personas, and no
                clinical or employment conclusions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {foundations.map((item) => (
                <div className="flex gap-3" key={item.title}>
                  <CheckCircle2
                    className="text-primary mt-0.5 size-5 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
