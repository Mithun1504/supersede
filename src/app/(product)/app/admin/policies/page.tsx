import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApprovalPolicyForm } from "@/modules/identity/components/approval-policy-form";
import { can, requireCurrentActor } from "@/modules/identity/policy";
import {
  listActiveApprovalPolicies,
  listAssignableRoles,
} from "@/modules/identity/repository";

export const metadata: Metadata = { title: "Approval policies" };

export default async function ApprovalPoliciesPage() {
  const actor = await requireCurrentActor();
  const [policies, roles] = await Promise.all([
    listActiveApprovalPolicies(actor),
    listAssignableRoles(actor),
  ]);
  const canManage = can(actor, "approval_policy.manage");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Versioned approval policies</h2>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Policy changes create immutable successor versions. Existing approval
          records retain the exact policy and object version used at decision
          time.
        </p>
      </div>
      {policies.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No active policies</CardTitle>
            <CardDescription>
              Complete organization provisioning before governed work begins.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        policies.map((policy) => (
          <Card key={policy.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="capitalize">
                    {policy.objectType.replaceAll("_", " ")} · {policy.action}
                  </CardTitle>
                  <CardDescription>
                    Separation of duties and authentication assurance for this
                    governed transition.
                  </CardDescription>
                </div>
                <Badge variant="outline">Version {policy.versionNumber}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ApprovalPolicyForm
                policy={policy}
                roles={roles}
                canManage={canManage}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
