import type React from "react";
import { ArrowRight, Check, CircleAlert, Minus } from "lucide-react";

import { Surface } from "@/components/product/product-shell";
import { cn } from "@/lib/utils";

export type MetricItem = {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon?: React.ComponentType<{ className?: string }> | undefined;
  tone?: "primary" | "cyan" | "success" | "warning" | "danger" | undefined;
};

const metricTone = {
  primary: "text-primary",
  cyan: "text-chart-2",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

export function MetricRail({
  items,
  connected = false,
}: {
  items: MetricItem[];
  connected?: boolean;
}) {
  return (
    <Surface className="overflow-hidden">
      <dl aria-label={connected ? "Connected measures" : "Measures"}>
        {items.map((item) => {
          const Icon = item.icon;
          const tone = item.tone ?? "primary";

          return (
            <div
              className="border-border grid gap-2 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(6rem,0.35fr)_minmax(14rem,1fr)] sm:items-baseline sm:gap-5 sm:px-6"
              key={item.label}
            >
              <dt className="flex min-w-0 items-center gap-2 text-sm font-bold">
                {Icon ? (
                  <Icon className={cn("size-4 shrink-0", metricTone[tone])} />
                ) : null}
                {item.label}
              </dt>
              <dd
                className={cn(
                  "font-heading text-2xl font-semibold tabular-nums",
                  metricTone[tone],
                )}
              >
                {item.value}
              </dd>
              <dd className="text-muted-foreground text-sm leading-6">
                {item.detail}
              </dd>
            </div>
          );
        })}
      </dl>
    </Surface>
  );
}

export type WorkflowStep = {
  title: string;
  detail: string;
  value?: string | undefined;
  state?: "complete" | "current" | "pending" | "warning" | undefined;
  icon?: React.ComponentType<{ className?: string }> | undefined;
};

const stateLabel = {
  complete: "Complete",
  current: "In review",
  pending: "Not started",
  warning: "Attention",
} as const;

export function WorkflowRail({
  steps,
  className,
}: {
  steps: WorkflowStep[];
  className?: string;
}) {
  return (
    <ol className={cn("border-border border-y", className)}>
      {steps.map((step, index) => {
        const state = step.state ?? "pending";
        const Icon =
          state === "complete"
            ? Check
            : state === "current"
              ? ArrowRight
              : state === "warning"
                ? CircleAlert
                : Minus;

        return (
          <li
            className={cn(
              "border-border grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0 sm:grid-cols-[2.5rem_minmax(10rem,0.55fr)_minmax(12rem,1fr)_auto] sm:items-center sm:gap-5",
              state === "current" && "bg-accent/45",
              state === "warning" && "bg-warning/5",
            )}
            key={step.title}
          >
            <span className="text-muted-foreground flex items-center gap-1 pl-2 text-xs font-bold tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="text-foreground font-bold">{step.title}</p>
            <p className="text-muted-foreground col-start-2 text-sm leading-5 sm:col-start-auto">
              {step.detail}
            </p>
            <p
              className={cn(
                "col-start-2 flex items-center gap-1.5 text-xs font-bold sm:col-start-auto sm:justify-end sm:pr-3",
                state === "complete" && "text-success",
                state === "current" && "text-primary",
                state === "warning" && "text-warning",
                state === "pending" && "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {step.value ?? stateLabel[state]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function SplitRule({
  label,
  text,
  detail,
  current = false,
}: {
  label: string;
  text: string;
  detail?: string;
  current?: boolean;
}) {
  return (
    <section
      className={cn(
        "min-h-40 p-5 sm:p-6",
        current ? "bg-success/[0.045]" : "bg-muted/35",
      )}
    >
      <p
        className={cn(
          "text-xs font-bold",
          current ? "text-success" : "text-destructive",
        )}
      >
        {label}
      </p>
      <blockquote className="font-heading text-foreground mt-4 text-base leading-relaxed font-semibold text-pretty">
        {text}
      </blockquote>
      {detail ? (
        <p className="text-muted-foreground mt-5 font-mono text-[10px] tracking-tight">
          {detail}
        </p>
      ) : null}
    </section>
  );
}
