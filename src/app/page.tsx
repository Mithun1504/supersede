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
    title: "Governed by design",
    description:
      "Tenant context, immutable versions, approvals, and append-only audit primitives.",
  },
  {
    title: "Evidence first",
    description:
      "Provider boundaries preserve citations, model provenance, and explicit uncertainty.",
  },
  {
    title: "Change to outcome",
    description:
      "Propagate maps blast radius; Displace delivers governed probes, correction, and rechecks.",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-28">
          <div className="space-y-6">
            <Badge variant="secondary">Governed change intelligence</Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold text-balance sm:text-6xl">
                Version control for governed organizational decisions.
              </h1>
              <p className="text-muted-foreground max-w-2xl text-lg leading-8 text-pretty">
                Trace source changes through reviewed dependencies, governed
                approvals, artifact remediation, and observable workforce
                outcomes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/app">
                  Open workspace
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/api/v1/health">Check API health</Link>
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Production controls</CardTitle>
              <CardDescription>
                Evidence, separation of duties, privacy boundaries, and durable
                workflows are enforced throughout.
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
