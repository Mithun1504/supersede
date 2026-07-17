import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/modules/identity/policy";
import { RemediationForm } from "@/modules/learning/components/remediation-form";
import { getLearnerRemediation } from "@/modules/learning/repository";

export const metadata: Metadata = { title: "Correction activity" };

export default async function RemediationPage({
  params,
}: {
  params: Promise<{ remediationAssignmentId: string }>;
}) {
  const { remediationAssignmentId } = await params;
  const actor = await requirePermission("learning.complete");
  const item = await getLearnerRemediation(actor, remediationAssignmentId);
  if (!item) notFound();
  const maySubmit = ["assigned", "opened", "failed"].includes(item.status);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">
            Applied correction · due {item.dueAt.toLocaleDateString()}
          </p>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
        </div>
        <Badge className="capitalize">{item.status.replaceAll("_", " ")}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Task</CardTitle>
          <CardDescription>{item.instructions}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-muted-foreground mb-2 text-xs">
              Starting work product
            </p>
            <div className="bg-muted rounded-xl p-4 text-sm whitespace-pre-wrap">
              {item.starterContent}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-2 text-xs">
              Governed updated-rule evidence
            </p>
            <blockquote className="border-primary/50 bg-primary/5 rounded-r-xl border-l-4 p-4 text-sm">
              “{item.evidenceQuote}”
            </blockquote>
          </div>
          {item.latest ? (
            <div className="rounded-xl border p-4">
              <Badge variant="secondary" className="capitalize">
                Attempt {item.latest.attemptNumber} ·{" "}
                {item.latest.outcome.replaceAll("_", " ")}
              </Badge>
              <p className="mt-3 text-sm">{item.latest.feedback}</p>
            </div>
          ) : null}
          {maySubmit ? (
            <RemediationForm assignmentId={item.id} />
          ) : item.status === "passed" ? (
            <p role="status" className="text-sm font-medium">
              Completed. Your spaced rechecks are scheduled.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
