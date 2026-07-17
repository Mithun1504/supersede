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
import {
  dispositionAction,
  releaseLegalHoldAction,
} from "@/modules/retention/actions";
import {
  LegalHoldForm,
  RetentionPolicyForm,
} from "@/modules/retention/components/retention-forms";
import { getRetentionWorkspace } from "@/modules/retention/repository";

export const metadata: Metadata = { title: "Retention and legal hold" };

export default async function RetentionPage() {
  const actor = await requirePermission("retention.manage");
  const data = await getRetentionWorkspace(actor);
  const activePolicy = data.policies.find(
    (policy) => policy.status === "approved",
  );
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-semibold">Retention and legal hold</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Versioned report-bundle policy, hold overrides, and auditable
          disposition runs. Recent MFA is required for every mutation.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Report retention policy</CardTitle>
            <CardDescription>
              New approvals supersede, never rewrite, the prior version.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RetentionPolicyForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Legal hold</CardTitle>
            <CardDescription>
              An active organization or exact-report hold blocks disposition.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalHoldForm organizationId={actor.organization.id} />
          </CardContent>
        </Card>
      </div>
      {activePolicy ? (
        <Card>
          <CardHeader>
            <CardTitle>Disposition control</CardTitle>
            <CardDescription>
              Dry run first; execution deletes only expired, unlocked report
              bundles outside every active hold.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <form action={dispositionAction}>
              <input
                type="hidden"
                name="retentionPolicyId"
                value={activePolicy.id}
              />
              <Button type="submit" name="mode" value="dry" variant="outline">
                Run dry assessment
              </Button>
            </form>
            <form action={dispositionAction}>
              <input
                type="hidden"
                name="retentionPolicyId"
                value={activePolicy.id}
              />
              <Button
                type="submit"
                name="mode"
                value="execute"
                variant="destructive"
              >
                Execute eligible disposition
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Policy history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.policies.length ? (
              data.policies.map((policy) => (
                <div key={policy.id} className="rounded-lg border p-3">
                  <div className="flex justify-between">
                    <Badge className="capitalize">{policy.status}</Badge>
                    <span className="text-xs">v{policy.versionNumber}</span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {policy.retentionDays} days · {policy.retentionMode} ·{" "}
                    {policy.dispositionAction}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No policy versions.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Legal holds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.holds.length ? (
              data.holds.map((hold) => (
                <div key={hold.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <Badge
                      variant={hold.releasedAt ? "outline" : "destructive"}
                    >
                      {hold.releasedAt ? "Released" : "Active"}
                    </Badge>
                    {!hold.releasedAt ? (
                      <form action={releaseLegalHoldAction}>
                        <input
                          type="hidden"
                          name="legalHoldId"
                          value={hold.id}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Release hold
                        </Button>
                      </form>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-medium">{hold.reference}</p>
                  <p className="text-muted-foreground text-xs">{hold.reason}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No legal holds.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Disposition run ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.runs.length ? (
            data.runs.map((run) => (
              <div
                key={run.id}
                className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4"
              >
                <span className="capitalize">{run.status}</span>
                <span>{run.candidateCount} candidates</span>
                <span>{run.heldCount} held</span>
                <span>{run.disposedCount} disposed</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No disposition runs.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
