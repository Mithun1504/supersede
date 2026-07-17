import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangeForm } from "@/modules/changes/components/change-form";
import { listChangeSourceVersions } from "@/modules/changes/repository";
import { requirePermission } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "New ChangeEvent" };

export default async function NewChangePage() {
  const actor = await requirePermission("change.write");
  const versions = await listChangeSourceVersions(actor);
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">Change control</p>
        <h1 className="text-3xl font-semibold">Submit a ChangeEvent</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lock the old and new rule</CardTitle>
          <CardDescription>
            Both citations are verified against immutable source text before the
            event can enter the validator queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versions.length < 2 ? (
            <p className="text-muted-foreground text-sm">
              At least two governed versions of the same source are required.
            </p>
          ) : (
            <ChangeForm versions={versions} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
