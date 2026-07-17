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
import { RemediationSuccessorForm } from "@/modules/changes/components/remediation-successor-form";
import { verifyRemediationAction } from "@/modules/changes/remediation-actions";
import { getRemediationDetail } from "@/modules/changes/repository";
import { can, requireCurrentActor } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Remediation" };

export default async function RemediationPage({
  params,
}: {
  params: Promise<{ remediationId: string }>;
}) {
  const { remediationId } = await params;
  const actor = await requireCurrentActor();
  const remediation = await getRemediationDetail(actor, remediationId);
  if (!remediation) notFound();
  const maySubmit =
    can(actor, "artifact.remediate_owned") &&
    remediation.assignedToMembershipId === actor.membership.id &&
    ["open", "assigned", "in_progress", "rejected"].includes(
      remediation.status,
    );
  const mayVerify =
    can(actor, "artifact.verify") &&
    remediation.status === "submitted" &&
    remediation.assignedToMembershipId !== actor.membership.id;
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-muted-foreground text-sm">
            {remediation.artifactTitle} · impacted{" "}
            {remediation.impactedVersionLabel}
          </p>
          <h1 className="text-3xl font-semibold">Artifact remediation</h1>
          <div className="mt-3 flex gap-2">
            <Badge className="capitalize">
              {remediation.status.replaceAll("_", " ")}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {remediation.requiredAction.replaceAll("_", " ")}
            </Badge>
          </div>
        </div>
        {mayVerify ? (
          <form action={verifyRemediationAction}>
            <input type="hidden" name="remediationId" value={remediation.id} />
            <Button type="submit">Verify and govern successor</Button>
          </form>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{remediation.diffSummary}</CardTitle>
          <CardDescription>
            Changed source: {remediation.sourceTitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="text-muted-foreground mb-2 text-xs">Old rule</p>
            <blockquote className="border-destructive/50 rounded-r-lg border-l-4 p-3 text-sm">
              {remediation.oldRule}
            </blockquote>
          </div>
          <div>
            <p className="text-muted-foreground mb-2 text-xs">New rule</p>
            <blockquote className="border-success/50 rounded-r-lg border-l-4 p-3 text-sm">
              {remediation.newRule}
            </blockquote>
          </div>
        </CardContent>
      </Card>
      {maySubmit ? (
        <Card>
          <CardHeader>
            <CardTitle>Create the corrected successor</CardTitle>
            <CardDescription>
              Submit the complete governed artifact, not a detached patch. The
              version links directly to the impacted artifact.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RemediationSuccessorForm remediation={remediation} />
          </CardContent>
        </Card>
      ) : null}
      {remediation.status === "submitted" ? (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting independent verification</CardTitle>
            <CardDescription>
              The submitting owner cannot verify this successor. An eligible
              reviewer must inspect and govern it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {remediation.status === "verified" ? (
        <Card>
          <CardHeader>
            <CardTitle>Remediation verified</CardTitle>
            <CardDescription>
              The successor is the governed current artifact version and the
              previous version remains immutable history.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
