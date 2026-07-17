import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { validateChangeAction } from "@/modules/changes/actions";
import { getChangeDetail } from "@/modules/changes/repository";
import { can, requireCurrentActor } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "ChangeEvent" };

export default async function ChangeDetailPage({
  params,
}: {
  params: Promise<{ changeEventId: string }>;
}) {
  const { changeEventId } = await params;
  const actor = await requireCurrentActor();
  const detail = await getChangeDetail(actor, changeEventId);
  if (!detail) notFound();
  const { change, impacts, propagation } = detail;
  const mayValidate =
    change.status === "submitted" &&
    change.enteredByMembershipId !== actor.membership.id &&
    can(actor, "change.validate");
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">{change.sourceTitle}</p>
          <h1 className="text-3xl font-semibold">ChangeEvent</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            {change.diffSummary}
          </p>
        </div>
        <Badge className="capitalize">{change.status}</Badge>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <RuleCard title="Previous rule" rule={change.oldRule} />
        <RuleCard title="New rule" rule={change.newRule} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Scope and validation</CardTitle>
          <CardDescription>
            A distinct eligible validator locks this exact event version before
            propagation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium">Affected population</p>
            <p className="text-muted-foreground">{change.affectedPopulation}</p>
          </div>
          {change.exclusions ? (
            <div>
              <p className="font-medium">Exclusions</p>
              <p className="text-muted-foreground">{change.exclusions}</p>
            </div>
          ) : null}
          {change.unresolvedAmbiguity ? (
            <div>
              <p className="font-medium">Unresolved ambiguity</p>
              <p className="text-warning">{change.unresolvedAmbiguity}</p>
            </div>
          ) : null}
          {mayValidate ? (
            <form action={validateChangeAction}>
              <input
                type="hidden"
                name="changeEventVersionId"
                value={change.versionId}
              />
              <Button type="submit">Validate exact version</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Blast radius</CardTitle>
          <CardDescription>
            {propagation
              ? `${propagation.status}: ${propagation.nodesExamined} nodes examined, ${propagation.impactsFound} impacts persisted.`
              : "Propagation begins only after validation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {impacts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {propagation?.status === "completed"
                ? "No reviewed dependency path was affected."
                : "No impacts are available yet."}
            </p>
          ) : (
            impacts.map((impact) => (
              <div key={impact.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">
                    {impact.artifactTitle ?? impact.claimText ?? "Graph target"}
                  </p>
                  <Badge variant="secondary" className="capitalize">
                    {impact.impactClass.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-2 text-sm">
                  {impact.rationale}
                </p>
                <p className="mt-2 text-xs">
                  Confidence {Math.round(Number(impact.confidence) * 100)}%
                  {impact.requiresRemediation ? " · Remediation required" : ""}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleCard({ title, rule }: { title: string; rule: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <blockquote className="border-primary/40 bg-muted/40 rounded-r-lg border-l-4 p-4 font-mono text-sm">
          {rule}
        </blockquote>
      </CardContent>
    </Card>
  );
}
