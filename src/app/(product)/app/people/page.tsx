import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can, requirePermission } from "@/modules/identity/policy";
import {
  ExposureMappingForm,
  PeopleImportForm,
} from "@/modules/people/components/people-management-forms";
import { getPeopleWorkspace } from "@/modules/people/repository";

export const metadata: Metadata = { title: "People exposure" };

export default async function PeoplePage() {
  const actor = await requirePermission("people.read");
  const data = await getPeopleWorkspace(actor);
  return (
    <div className="space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">
          Displace · privacy-safe scope
        </p>
        <h1 className="text-3xl font-semibold">
          People and potential exposure
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Role mappings indicate who may have used an artifact. They never claim
          an individual’s mental state.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>People directory</CardTitle>
            <CardDescription>
              {data.people.length} authorized records
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y rounded-xl border p-0">
            {data.people.map((person) => (
              <div
                key={person.id}
                className="flex flex-wrap justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {person.displayName ?? "Protected person"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {person.email ?? "No email"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary">
                    {person.roleName ?? "No role"}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {person.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Accepted exposure mappings</CardTitle>
            <CardDescription>
              Potential exposure via current work role
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.mappings.length ? (
              data.mappings.map((mapping) => (
                <div key={mapping.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {mapping.roleName} → {mapping.artifactTitle}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {mapping.rationale}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No mappings accepted.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {can(actor, "people.manage") ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Import fictional directory data</CardTitle>
              <CardDescription>
                Upserts people, roles, and active role membership.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PeopleImportForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Map a role to an artifact</CardTitle>
              <CardDescription>
                Human-reviewed mapping used for potential-exposure resolution.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExposureMappingForm
                roles={data.roles}
                artifacts={data.artifacts}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
