import { randomUUID } from "node:crypto";

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
import { can, requirePermission } from "@/modules/identity/policy";
import {
  authorizeReleaseAction,
  simulateSeededPersonasAction,
} from "@/modules/releases/actions";
import { ReleaseForm } from "@/modules/releases/components/release-form";
import { getReleaseWorkspace } from "@/modules/releases/repository";

export const metadata: Metadata = { title: "Release authorization" };

export default async function ReleasesPage() {
  const actor = await requirePermission("release.prepare");
  const data = await getReleaseWorkspace(actor);
  return (
    <div className="space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">
          Displace · governed delivery
        </p>
        <h1 className="text-3xl font-semibold">Release authorization</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Freeze exact approved cases, correction exercises, and a resolved
          audience before a different authorized person releases assignments.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.35fr]">
        <Card>
          <CardHeader>
            <CardTitle>Prepare immutable snapshot</CardTitle>
            <CardDescription>
              Requires three current approved cases and one approved exercise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReleaseForm
              idempotencyKey={randomUUID()}
              changes={data.changes}
              roles={data.roles}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Release ledger</CardTitle>
            <CardDescription>
              {data.batches.length} governed batches
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.batches.length ? (
              data.batches.map((batch) => (
                <div key={batch.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Badge className="capitalize">
                        {batch.status.replaceAll("_", " ")}
                      </Badge>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {batch.resolvedPersonCount} snapshotted people ·{" "}
                        {batch.caseCount} cases · hash{" "}
                        {batch.audienceHash?.slice(0, 12) ?? "pending"}…
                      </p>
                    </div>
                    {batch.status === "awaiting_authorization" &&
                    can(actor, "release.authorize") &&
                    batch.requestedBy !== actor.membership.id ? (
                      <form action={authorizeReleaseAction}>
                        <input
                          type="hidden"
                          name="releaseBatchId"
                          value={batch.id}
                        />
                        <Button type="submit" size="sm">
                          Authorize and release
                        </Button>
                      </form>
                    ) : null}
                  </div>
                  {batch.status === "awaiting_authorization" &&
                  batch.requestedBy === actor.membership.id ? (
                    <p className="text-muted-foreground mt-3 text-xs">
                      A different eligible release authorizer must approve this
                      snapshot.
                    </p>
                  ) : null}
                  {batch.status === "released" ? (
                    <form
                      action={simulateSeededPersonasAction}
                      className="mt-3"
                    >
                      <input
                        type="hidden"
                        name="releaseBatchId"
                        value={batch.id}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Run fictional persona responses
                      </Button>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Processes only records explicitly marked as seeded
                        personas; every event is labeled simulated.
                      </p>
                    </form>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No release snapshots yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
