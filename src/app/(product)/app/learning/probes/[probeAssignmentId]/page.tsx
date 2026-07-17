import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProbeForm } from "@/modules/learning/components/probe-form";
import { getLearnerProbe } from "@/modules/learning/repository";
import { requirePermission } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Cold scenario" };

export default async function ProbePage({
  params,
}: {
  params: Promise<{ probeAssignmentId: string }>;
}) {
  const actor = await requirePermission("learning.complete");
  const { probeAssignmentId } = await params;
  const probe = await getLearnerProbe(actor, probeAssignmentId);
  const options = Array.isArray(probe.options)
    ? probe.options.filter(
        (option): option is { id: string; label: string } =>
          typeof option === "object" &&
          option !== null &&
          "id" in option &&
          "label" in option &&
          typeof option.id === "string" &&
          typeof option.label === "string",
      )
    : [];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="secondary" className="capitalize">
          {probe.kind.replaceAll("_", " ")}
        </Badge>
        <span className="text-muted-foreground text-sm">
          Due {probe.dueAt.toLocaleDateString()}
        </span>
      </div>
      <Card>
        <CardHeader>
          <CardDescription>
            Respond based on how you would handle this situation now.
          </CardDescription>
          <CardTitle className="text-xl leading-relaxed">
            {probe.scenario}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {probe.feedback ? (
            <div role="status" className="space-y-5">
              <div className="bg-muted rounded-xl p-4">
                <p className="font-medium">Response recorded</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {probe.feedback.label === "old"
                    ? "A correction activity is available on your learning home."
                    : probe.feedback.label === "other"
                      ? "A human assessor will review this response."
                      : "Your response aligns with the updated rule."}
                </p>
              </div>
              <div>
                <h2 className="font-semibold">Updated rule</h2>
                <p className="mt-2 text-sm">{probe.feedback.newRule}</p>
                <blockquote className="border-primary/50 bg-primary/5 mt-4 rounded-r-xl border-l-4 p-4 text-sm">
                  “{probe.feedback.quote}”
                </blockquote>
                <p className="text-muted-foreground mt-3 text-sm">
                  {probe.feedback.reviewerRationale}
                </p>
              </div>
            </div>
          ) : options.length >= 2 ? (
            <ProbeForm
              assignmentId={probe.id}
              clientSubmissionId={randomUUID()}
              options={options}
            />
          ) : (
            <p role="alert" className="text-destructive text-sm">
              This governed case has no valid response options. Contact an
              administrator.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
