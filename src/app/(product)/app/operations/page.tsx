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
import { retryOutboxAction } from "@/modules/operations/actions";
import { getOperationsWorkspace } from "@/modules/operations/repository";

export const metadata: Metadata = { title: "Operations" };

export default async function OperationsPage() {
  const actor = await requirePermission("operations.read");
  const data = await getOperationsWorkspace(actor);
  return (
    <div className="space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">Auditable runtime state</p>
        <h1 className="text-3xl font-semibold">Operations</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Durable domain state is shown here; provider dashboards are diagnostic
          tools, not the source of truth.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Active or failed workflows</CardDescription>
            <CardTitle className="text-3xl">
              {
                data.workflows.filter(
                  (item) => !["completed", "cancelled"].includes(item.status),
                ).length
              }
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Pending outbox events</CardDescription>
            <CardTitle className="text-3xl">{data.outbox.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Provider cost this month</CardDescription>
            <CardTitle className="text-3xl">
              {data.costMinor} minor units
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Workflow runs</CardTitle>
          <CardDescription>Durable status and progress.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.workflows.length ? (
            data.workflows.map((run) => (
              <div
                key={run.id}
                className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[1.2fr_1fr_1fr_2fr]"
              >
                <span className="font-medium">{run.workflowName}</span>
                <Badge className="w-fit capitalize">
                  {run.status.replaceAll("_", " ")}
                </Badge>
                <span>
                  {run.progressCurrent}/{run.progressTotal ?? "?"}
                </span>
                <span className="text-muted-foreground truncate">
                  {run.errorSummary ?? run.subjectType}
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">No workflow runs.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>AI model runs</CardTitle>
          <CardDescription>
            Opaque provenance and metrics; no governed content is displayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.modelRuns.length ? (
            data.modelRuns.map((run) => (
              <div
                key={run.id}
                className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[1.2fr_1fr_1fr_1fr]"
              >
                <span className="font-medium">{run.taskType}</span>
                <Badge className="w-fit capitalize">{run.status}</Badge>
                <span>
                  {run.inputTokens ?? 0} in / {run.outputTokens ?? 0} out
                </span>
                <span className="text-muted-foreground">
                  {run.latencyMs ?? 0} ms{" "}
                  {run.errorCode ? `· ${run.errorCode}` : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">No model runs.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Transactional outbox</CardTitle>
          <CardDescription>
            Failed events use bounded backoff and authorized retry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.outbox.length ? (
            data.outbox.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{event.eventName}</p>
                  <p className="text-muted-foreground text-xs">
                    {event.status} · attempt {event.attempts}
                  </p>
                </div>
                {can(actor, "operations.retry") ? (
                  <form action={retryOutboxAction}>
                    <input
                      type="hidden"
                      name="outboxEventId"
                      value={event.id}
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Make available now
                    </Button>
                  </form>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No pending or failed events.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
