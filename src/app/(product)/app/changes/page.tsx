import Link from "next/link";
import type { Metadata } from "next";

import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listChanges } from "@/modules/changes/repository";
import { can, requireCurrentActor } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "ChangeEvents" };

export default async function ChangesPage() {
  const actor = await requireCurrentActor();
  const changes = await listChanges(actor);
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Governed transitions</p>
          <h1 className="text-3xl font-semibold">ChangeEvents</h1>
        </div>
        {can(actor, "change.write") ? (
          <Button asChild>
            <Link href="/app/changes/new">
              <Plus aria-hidden="true" /> New ChangeEvent
            </Link>
          </Button>
        ) : null}
      </div>
      {changes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No ChangeEvents yet</CardTitle>
            <CardDescription>
              Add and approve a successor source version before submitting a
              governed old-to-new rule change.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {changes.map((change) => (
              <Link
                key={change.versionId}
                href={`/app/changes/${change.id}`}
                className="hover:bg-muted/40 focus-visible:ring-ring grid gap-2 p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-medium">{change.sourceTitle}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {change.diffSummary}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <Badge className="capitalize">{change.status}</Badge>
                  {change.propagationStatus ? (
                    <Badge variant="outline" className="capitalize">
                      Propagation {change.propagationStatus}
                    </Badge>
                  ) : null}
                  {change.impactsFound ? (
                    <Badge variant="secondary">
                      {change.impactsFound} impacts
                    </Badge>
                  ) : null}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
