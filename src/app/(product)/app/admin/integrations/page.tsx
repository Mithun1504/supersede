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
import { disableIntegrationAction } from "@/modules/integrations/actions";
import { IntegrationForm } from "@/modules/integrations/components/integration-form";
import { getIntegrationWorkspace } from "@/modules/integrations/repository";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const actor = await requirePermission("integration.manage");
  const data = await getIntegrationWorkspace(actor);
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-semibold">Integrations</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Verified delivery and learning-system boundaries. Secrets remain in
          the deployment secret manager.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Slack direct delivery</CardTitle>
            <CardDescription>
              Uses verified email lookup and direct app messages; requires
              chat:write and users:read.email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IntegrationForm type="slack" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>HRIS CSV boundary</CardTitle>
            <CardDescription>
              Enables source-scoped upsert or full-snapshot deprovisioning with
              per-row results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IntegrationForm type="hris_csv" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>xAPI 1.0.3 export</CardTitle>
            <CardDescription>
              Exports immutable assessment revisions as learner activity
              statements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <IntegrationForm type="lms_xapi" />
            <form action="/api/v1/integrations/xapi" method="post">
              <Button type="submit" variant="outline">
                Export xAPI statements
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.connections.length ? (
            data.connections.map((connection) => (
              <div
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{connection.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {connection.type.replace("_", " ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      connection.status === "active" ? "default" : "outline"
                    }
                  >
                    {connection.status}
                  </Badge>
                  {connection.status === "active" ? (
                    <form action={disableIntegrationAction}>
                      <input
                        type="hidden"
                        name="connectionId"
                        value={connection.id}
                      />
                      <Button size="sm" variant="outline">
                        Disable
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No integration connections.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Export and import jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.jobs.length ? (
            data.jobs.map((job) => (
              <div
                key={job.id}
                className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4"
              >
                <span>{job.jobType}</span>
                <span className="capitalize">{job.status}</span>
                <span>{job.succeededCount} succeeded</span>
                <span>{job.failedCount} failed</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No integration jobs.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
