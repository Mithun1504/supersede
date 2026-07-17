import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OrganizationSettingsForm } from "@/modules/identity/components/organization-settings-form";
import { can, requireCurrentActor } from "@/modules/identity/policy";
import { getOrganizationOverview } from "@/modules/identity/repository";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrganizationSettingsPage() {
  const actor = await requireCurrentActor();
  const overview = await getOrganizationOverview(actor);
  const settings = overview.settings ?? {
    defaultTimezone: "UTC",
    locale: "en",
    individualResultPolicy: "aggregate_only",
    minimumAggregateCohortSize: 5,
    reviewConfidenceThreshold: "0.7500",
    maxGraphDepth: 8,
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Governance defaults</CardTitle>
          <CardDescription>
            Privacy, review, and graph policies used across governed workflows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationSettingsForm
            settings={settings}
            canManage={can(actor, "organization.manage")}
          />
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Product contract</CardTitle>
          <CardDescription>
            Configuration is provisioned, not changed from this screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge className="capitalize">
            {actor.organization.productConfiguration}
          </Badge>
          <p className="text-muted-foreground text-sm">
            {actor.organization.productConfiguration === "displace"
              ? "Includes people exposure, divergence cases, release authorization, and learning outcomes."
              : "Contains corpus, evidence, graph, change propagation, and artifact remediation without a people layer."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
