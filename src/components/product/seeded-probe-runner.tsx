"use client";

import { useId, useState } from "react";
import { Check, Circle, RotateCcw } from "lucide-react";

import { probeSteps } from "@/components/product/demo-data";
import { SectionTitle, Surface } from "@/components/product/product-shell";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const answers = [
  "Start high-dose IV PPI now, before endoscopy",
  "Plan high-dose IV PPI as soon as possible after endoscopy",
  "Start oral PPI twice daily now",
  "No PPI is needed",
] as const;

const originalCorrection =
  "Start high-dose IV PPI before endoscopy when high-risk stigmata are suspected.";
const approvedCorrection =
  "Plan high-dose IV PPI as soon as possible after endoscopy when high-risk stigmata are confirmed.";

type Phase = "ready" | "assessed" | "correcting" | "passed";

export function SeededProbeRunner() {
  const correctionId = useId();
  const [phase, setPhase] = useState<Phase>("ready");
  const [correction, setCorrection] = useState(originalCorrection);
  const [feedback, setFeedback] = useState<string>();

  function runScriptedResponse() {
    setPhase("assessed");
    setFeedback(undefined);
  }

  function checkCorrection() {
    const normalized = correction.toLowerCase();
    const passes =
      normalized.includes("after endoscopy") &&
      !normalized.includes("before endoscopy");
    if (passes) {
      setPhase("passed");
      setFeedback(
        "Correction passed against the approved new-rule citation. A different-case recheck is now scheduled.",
      );
      return;
    }
    setPhase("correcting");
    setFeedback(
      "The correction still applies the old timing. Use the cited new rule: high-dose IV PPI after endoscopy.",
    );
  }

  function resetRunner() {
    setPhase("ready");
    setCorrection(originalCorrection);
    setFeedback(undefined);
  }

  const hasResponse = phase !== "ready";

  return (
    <section className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="border-foreground bg-foreground rounded-[32px] border-8 p-3 shadow-sm">
        <div className="bg-card min-h-[560px] rounded-[24px] p-4">
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>12:26</span>
            <span>iOS · Supersede</span>
          </div>
          <div className="border-border mt-4 border-b pb-3">
            <p className="font-semibold">Instinct probe</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Scripted persona · 1 of 1 · ~3 min
            </p>
          </div>
          <p className="mt-5 text-base leading-7">
            You are caring for a 64-year-old who presents to the ED with
            hematemesis and melena. Endoscopy is scheduled within the hour;
            suspected high-risk stigmata.
          </p>
          <div className="mt-5 space-y-3" aria-label="Probe answers">
            {answers.map((answer, index) => (
              <div
                className={
                  hasResponse && index === 0
                    ? "border-primary bg-primary/10 rounded-lg border p-3"
                    : "border-border rounded-lg border p-3"
                }
                key={answer}
              >
                <div className="flex gap-3">
                  <Circle
                    className={
                      hasResponse && index === 0
                        ? "text-primary mt-1 size-4 fill-current"
                        : "text-muted-foreground mt-1 size-4"
                    }
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-6">{answer}</p>
                </div>
              </div>
            ))}
          </div>
          {hasResponse ? (
            <div
              className="border-warning bg-warning/10 text-warning-foreground mt-5 rounded-lg border px-4 py-3 text-sm font-medium"
              data-product-action="probe-response-submitted"
              role="status"
            >
              Assessed old-rule response
            </div>
          ) : (
            <Button className="mt-5 w-full" onClick={runScriptedResponse}>
              Run R.N. Adams response
            </Button>
          )}
          <p className="text-muted-foreground mt-4 font-mono text-xs">
            simulated delivery · DEL-8F7C1A2D
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Surface>
          <SectionTitle
            title="Seeded persona runner"
            detail="This browser-only rehearsal uses a declared fictional response pattern. It does not write a governed person record."
          />
          <div className="border-border border-t p-4 sm:p-6">
            <p className="text-muted-foreground text-sm leading-6">
              No banner tells the persona the rule changed. The real workflow
              records assignment, delivery, assessment, remediation, and a
              different-case recheck as separate events.
            </p>
          </div>
        </Surface>

        <Surface>
          <SectionTitle
            title="Remediation · R.N. Adams"
            detail="Correct the actual order-set instruction; passive re-reading does not count."
          />
          <div className="space-y-4 p-4 sm:p-6">
            {phase === "ready" ? (
              <p className="text-muted-foreground text-sm leading-6">
                Run the scripted response to reveal the targeted correction.
              </p>
            ) : (
              <div className="space-y-3">
                <Label htmlFor={correctionId}>Order-set instruction</Label>
                <Textarea
                  id={correctionId}
                  value={correction}
                  disabled={phase === "passed"}
                  onChange={(event) => setCorrection(event.target.value)}
                  className="min-h-28 leading-6"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={phase === "passed"}
                    onClick={() => {
                      setCorrection(approvedCorrection);
                      setPhase("correcting");
                      setFeedback(undefined);
                    }}
                  >
                    Apply cited correction
                  </Button>
                  <Button
                    type="button"
                    disabled={phase === "passed"}
                    onClick={checkCorrection}
                  >
                    <Check className="size-4" aria-hidden="true" />
                    Check correction
                  </Button>
                </div>
              </div>
            )}

            {feedback ? (
              <p
                className={
                  phase === "passed"
                    ? "text-success text-sm leading-6 font-medium"
                    : "text-warning-foreground text-sm leading-6"
                }
                aria-live="polite"
              >
                {feedback}
              </p>
            ) : null}

            <div className="border-border space-y-3 border-t pt-4">
              {probeSteps.map((step, index) => {
                const done =
                  (index === 0 && hasResponse) ||
                  (index > 0 && index < 3 && phase === "passed");
                const scheduled = index === 3 && phase === "passed";
                return (
                  <div className="flex items-center gap-3" key={step}>
                    <StatusPill
                      tone={
                        done ? "success" : scheduled ? "warning" : "neutral"
                      }
                    >
                      {done ? "Done" : scheduled ? "Scheduled" : "Pending"}
                    </StatusPill>
                    <p className="text-sm">{step}</p>
                  </div>
                );
              })}
            </div>

            {phase === "passed" ? (
              <Button type="button" variant="ghost" onClick={resetRunner}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Reset rehearsal
              </Button>
            ) : null}
          </div>
        </Surface>
      </div>
    </section>
  );
}
