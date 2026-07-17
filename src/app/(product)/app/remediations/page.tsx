import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listRemediations } from "@/modules/changes/repository";
import { requireCurrentActor } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Artifact remediation" };

export default async function RemediationsPage() {
  const actor = await requireCurrentActor();
  const tasks = await listRemediations(actor);
  return (
    <div className="space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">Owner work queue</p>
        <h1 className="text-3xl font-semibold">Artifact remediation</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Each replacement is an immutable direct successor. Its creator cannot
          perform the independent verification that makes it current.
        </p>
      </div>
      {tasks.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No remediation tasks</CardTitle>
            <CardDescription>
              Validated ChangeEvents create tasks only for artifacts reached by
              reviewed dependency paths.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-5">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardHeader>
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <CardTitle>{task.artifactTitle}</CardTitle>
                    <CardDescription>
                      Impacted version {task.impactedVersionLabel} ·{" "}
                      {task.requiredAction.replaceAll("_", " ")}
                    </CardDescription>
                  </div>
                  <Badge className="capitalize">
                    {task.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted-foreground text-sm">
                    Assigned to {task.assigneeName ?? "an artifact owner"}.
                  </p>
                  <Button asChild variant="outline">
                    <Link href={`/app/remediations/${task.id}`}>Open task</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
