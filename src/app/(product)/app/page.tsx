import { ArrowRight, CheckCircle2, CircleAlert, Users } from "lucide-react";
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
import { getOrganizationOverview } from "@/modules/identity/repository";
import { can, requireCurrentActor } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Overview" };

export default async function WorkspacePage() {
  const actor = await requireCurrentActor();
  const canReadOrganization = can(actor, "organization.read");
  const overview = canReadOrganization
    ? await getOrganizationOverview(actor)
    : null;
  const isLearnerOnly =
    actor.roles.length === 1 && actor.roles[0] === "learner";

  if (isLearnerOnly) {
    return (
      <section className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <Badge>My learning</Badge>
          <h1 className="text-3xl font-semibold">
            Welcome back, {actor.membership.displayName.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground">
            Your assigned scenarios, remediation, and completion receipts appear
            here without peer comparisons or punitive rankings.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No assignments due</CardTitle>
            <CardDescription>
              You are caught up. New work will appear here when it is authorized
              for release.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const setupItems = overview
    ? [
        {
          label: "Organization settings",
          complete: Boolean(overview.settings),
        },
        { label: "Active members", complete: overview.activeMemberCount > 0 },
        { label: "Role coverage", complete: overview.activeRoleGrantCount > 0 },
      ]
    : [];
  const completedSetup = setupItems.filter((item) => item.complete).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div className="space-y-2">
          <Badge variant="secondary">Workspace overview</Badge>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Good to see you, {actor.membership.displayName.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Prioritized governed work, evidence review, and operational health
            will converge here as one role-aware queue.
          </p>
        </div>
        {can(actor, "corpus.write") ? (
          <Button asChild size="lg">
            <Link href="/app/corpus/new">
              Add corpus content <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>

      {overview ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Setup"
            value={`${completedSetup}/${setupItems.length}`}
            detail="foundation checks complete"
          />
          <MetricCard
            label="Active members"
            value={String(overview.activeMemberCount)}
            detail={`${overview.invitedMemberCount} invited`}
          />
          <MetricCard
            label="Role grants"
            value={String(overview.activeRoleGrantCount)}
            detail="active authorization grants"
          />
          <MetricCard
            label="Configuration"
            value={actor.organization.productConfiguration}
            detail="contract-enforced product boundary"
          />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Priority inbox</CardTitle>
            <CardDescription>
              Review, validation, approval, remediation, and recovery tasks are
              ordered by due state and governance risk.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-border grid min-h-44 place-items-center rounded-xl border border-dashed p-6 text-center">
              <div>
                <CheckCircle2 className="text-success mx-auto mb-3 size-8" />
                <p className="font-medium">No governed work is waiting</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  New tasks appear after corpus ingestion or a submitted change.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {overview ? (
          <Card>
            <CardHeader>
              <CardTitle>Organization readiness</CardTitle>
              <CardDescription>
                Required foundations before governed workflows begin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {setupItems.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  {item.complete ? (
                    <CheckCircle2 className="text-success size-5" />
                  ) : (
                    <CircleAlert className="text-warning size-5" />
                  )}
                  <span className="text-sm">{item.label}</span>
                </div>
              ))}
              {can(actor, "organization.manage") ? (
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link href="/app/admin/organization">
                    Review setup <Users aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl capitalize">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}
