import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/modules/identity/policy";
import { listLearnerWork } from "@/modules/learning/repository";

export const metadata: Metadata = { title: "My learning" };

export default async function LearningPage() {
  const actor = await requirePermission("learning.complete");
  const data = await listLearnerWork(actor);
  const openProbes = data.probes.filter((probe) =>
    ["assigned", "opened"].includes(probe.status),
  );
  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">
          Private learner workspace
        </p>
        <h1 className="text-3xl font-semibold">My learning</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Complete cold scenarios first. If a correction is needed, it appears
          only after your response is securely recorded.
        </p>
      </div>
      <section aria-labelledby="probes-heading">
        <h2 id="probes-heading" className="mb-3 text-lg font-semibold">
          Scenarios
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {openProbes.length ? (
            openProbes.map((probe) => (
              <Card key={probe.id}>
                <CardHeader>
                  <div className="flex justify-between gap-3">
                    <Badge variant="secondary" className="capitalize">
                      {probe.kind.replaceAll("_", " ")}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      Due {probe.dueAt.toLocaleDateString()}
                    </span>
                  </div>
                  <CardTitle className="line-clamp-3 text-base">
                    {probe.scenario}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href={`/app/learning/probes/${probe.id}`}>
                      Open scenario
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="sm:col-span-2">
              <CardHeader>
                <CardTitle>You’re caught up</CardTitle>
                <CardDescription>
                  No cold scenarios are currently due.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </section>
      <section aria-labelledby="corrections-heading">
        <h2 id="corrections-heading" className="mb-3 text-lg font-semibold">
          Correction activities
        </h2>
        <Card>
          <CardContent className="pt-6">
            {data.remediations.length ? (
              <div className="space-y-3">
                {data.remediations.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <Badge className="capitalize">
                        {item.status.replaceAll("_", " ")}
                      </Badge>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Due {item.dueAt.toLocaleDateString()}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/learning/remediations/${item.id}`}>
                        Open activity
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No correction activities are assigned.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
