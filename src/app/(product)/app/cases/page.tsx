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
import {
  approveCaseAction,
  approveExerciseAction,
} from "@/modules/cases/actions";
import { CaseForm } from "@/modules/cases/components/case-form";
import { CaseGenerationForm } from "@/modules/cases/components/case-generation-form";
import { CaseRetirementForm } from "@/modules/cases/components/case-retirement-form";
import { getCasesWorkspace } from "@/modules/cases/repository";
import { can, requirePermission } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Divergence cases" };

export default async function CasesPage() {
  const actor = await requirePermission("case.read");
  const data = await getCasesWorkspace(actor);
  return (
    <div className="space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">Displace · cold probes</p>
        <h1 className="text-3xl font-semibold">Divergence cases</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Cases test one response under one wording at one time. They never
          support conclusions beyond the recorded response.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Correction exercise review</CardTitle>
          <CardDescription>
            Exercise versions are approved independently from their cases and
            are the only versions eligible for release.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {data.exercises.length ? (
            data.exercises.map((exercise) => (
              <div key={exercise.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge className="capitalize">
                    {exercise.status.replaceAll("_", " ")}
                  </Badge>
                  {exercise.status === "in_review" &&
                  can(actor, "case.approve") &&
                  exercise.creatorId !== actor.membership.id ? (
                    <form action={approveExerciseAction}>
                      <input
                        type="hidden"
                        name="exerciseVersionId"
                        value={exercise.id}
                      />
                      <Button size="sm" type="submit">
                        Approve exercise
                      </Button>
                    </form>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-medium">{exercise.title}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {exercise.instructions}
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              Approve a case to create its exercise draft.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Governed case library</CardTitle>
            <CardDescription>
              {data.cases.length} immutable case versions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.cases.length ? (
              data.cases.map((item) => (
                <div key={item.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <Badge className="capitalize">
                      {item.retiredAt
                        ? "retired"
                        : item.status.replaceAll("_", " ")}
                    </Badge>
                    {!item.retiredAt &&
                    item.status === "in_review" &&
                    can(actor, "case.approve") &&
                    item.creatorId !== actor.membership.id ? (
                      <form action={approveCaseAction}>
                        <input
                          type="hidden"
                          name="caseVersionId"
                          value={item.id}
                        />
                        <Button type="submit" size="sm">
                          Approve case
                        </Button>
                      </form>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-medium">{item.scenario}</p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Reviewer rationale: {item.rationale}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {item.citations.map((citation) => (
                      <blockquote
                        key={`${citation.side}-${citation.quote}`}
                        className="bg-muted rounded-lg p-3 text-xs"
                      >
                        <span className="font-medium capitalize">
                          {citation.side} · {citation.sourceTitle}
                        </span>
                        <span className="text-muted-foreground mt-1 block">
                          “{citation.quote}”
                        </span>
                      </blockquote>
                    ))}
                  </div>
                  {item.retiredAt ? (
                    <p className="text-muted-foreground mt-3 text-xs">
                      Retired: {item.retirementReason?.replaceAll("_", " ")}
                    </p>
                  ) : item.status === "approved" &&
                    can(actor, "case.approve") ? (
                    <CaseRetirementForm caseVersionId={item.id} />
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No cases created.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Create a single-choice case</CardTitle>
            <CardDescription>
              Exact old/new grading with no pre-submit answer leakage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CaseForm changes={data.changes} />
          </CardContent>
        </Card>
      </div>
      {can(actor, "case.approve") ? (
        <Card>
          <CardHeader>
            <CardTitle>Generate cited cold cases</CardTitle>
            <CardDescription>
              GPT‑5.6 creates exactly three distinct drafts from the validated
              old/new rules and exact evidence. Every draft remains blocked
              until an independent expert approves it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CaseGenerationForm changes={data.changes} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
