import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/modules/identity/policy";
import { ReviewDecisionForm } from "@/modules/review/components/review-decision-form";
import { QuoteFailureForm } from "@/modules/review/components/quote-failure-form";
import { CorrectionAssessmentForm } from "@/modules/review/components/correction-assessment-form";
import { ProbeAssessmentForm } from "@/modules/review/components/probe-assessment-form";
import { listReviewQueue } from "@/modules/review/repository";

export const metadata: Metadata = { title: "Review inbox" };

export default async function ReviewInboxPage() {
  const actor = await requirePermission("edge.review");
  const queue = await listReviewQueue(actor);
  return (
    <div className="space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">Human control plane</p>
        <h1 className="text-3xl font-semibold">Review inbox</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          AI candidates stay outside the authoritative graph until an eligible
          reviewer accepts evidence-backed claims and dependencies.
        </p>
      </div>
      {queue.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Queue clear</CardTitle>
            <CardDescription>
              No claim or dependency candidates currently need review.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {queue.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{item.text}</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {item.taskType.replaceAll("_", " ")}
                    </Badge>
                    <Badge variant="outline">Priority {item.priority}</Badge>
                  </div>
                </div>
                <CardDescription>
                  {item.reasonCode.replaceAll("_", " ")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {item.quote ? (
                  <blockquote className="border-primary/40 bg-muted/50 rounded-r-lg border-l-4 p-3 text-sm">
                    “{item.quote}”
                  </blockquote>
                ) : null}
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground text-xs">Confidence</p>
                    <p className="font-medium">
                      {item.confidence === null
                        ? "Unavailable"
                        : `${Math.round(item.confidence * 100)}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">
                      Load bearing
                    </p>
                    <p className="font-medium">
                      {item.loadBearingScore === null
                        ? "Unavailable"
                        : `${Math.round(item.loadBearingScore * 100)}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Evidence</p>
                    <p className="font-medium capitalize">
                      {item.verificationStatus.replaceAll("_", " ")}
                    </p>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm">
                  {item.rationale}
                </p>
                {item.taskType === "probe_assessment" && item.submission ? (
                  <ProbeAssessmentForm
                    reviewTaskId={item.id}
                    response={item.submission}
                  />
                ) : item.taskType === "artifact_remediation" &&
                  item.submission ? (
                  <CorrectionAssessmentForm
                    reviewTaskId={item.id}
                    submission={item.submission}
                  />
                ) : item.taskType === "claim" ||
                  item.taskType === "dependency_edge" ? (
                  <ReviewDecisionForm
                    reviewTaskId={item.id}
                    candidateText={item.text}
                    allowEdit={item.taskType === "claim"}
                  />
                ) : item.taskType === "quote_verification" ? (
                  <QuoteFailureForm reviewTaskId={item.id} />
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
