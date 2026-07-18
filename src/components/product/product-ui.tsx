import type React from "react";
import { ArrowRight, Check, Circle } from "lucide-react";

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
  primary: "text-primary bg-primary/8 border-primary/15",
  cyan: "text-chart-2 bg-chart-2/8 border-chart-2/15",
  success: "text-success bg-success/8 border-success/15",
  warning: "text-warning bg-warning/10 border-warning/20",
  danger: "text-destructive bg-destructive/8 border-destructive/15",
} as const;

const metricTileTone = {
  primary: "border-border border-t-primary/45 hover:border-primary/25",
  cyan: "border-border border-t-chart-2/45 hover:border-chart-2/25",
  success: "border-border border-t-success/45 hover:border-success/25",
  warning: "border-border border-t-warning/50 hover:border-warning/30",
  danger: "border-border border-t-destructive/45 hover:border-destructive/25",
} as const;

export function MetricRail({
  items,
  connected = false,
}: {
  items: MetricItem[];
  connected?: boolean;
}) {
  return (
    <Surface className="relative overflow-hidden p-1.5">
      <div
        className={cn(
          "grid gap-2",
          items.length === 4
            ? "sm:grid-cols-2 xl:grid-cols-4"
            : "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          const tone = item.tone ?? "primary";
          return (
            <article
              className={cn(
                "group bg-card relative min-w-0 overflow-hidden rounded-lg border border-t-2 p-4 transition-[border-color,box-shadow] duration-200 hover:shadow-sm sm:p-5",
                metricTileTone[tone],
              )}
              key={item.label}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="data-label">{item.label}</p>
                  <p className="font-heading mt-2 text-3xl font-semibold tabular-nums">
                    {item.value}
                  </p>
                </div>
                {Icon ? (
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg border",
                      metricTone[tone],
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                {item.detail}
              </p>
              {connected && index < items.length - 1 ? (
                <ArrowRight className="text-muted-foreground/35 absolute top-1/2 -right-2 z-10 hidden size-4 -translate-y-1/2 xl:block" />
              ) : null}
            </article>
          );
        })}
      </div>
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

export function WorkflowRail({
  steps,
  className,
}: {
  steps: WorkflowStep[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "scrollbar-subtle grid gap-0 overflow-x-auto pb-2 lg:grid-cols-[repeat(var(--step-count),minmax(0,1fr))] lg:overflow-visible",
        className,
      )}
      style={{ "--step-count": steps.length } as React.CSSProperties}
    >
      {steps.map((step, index) => {
        const Icon = step.icon;
        const state = step.state ?? "pending";
        return (
          <article
            className={cn(
              "relative min-w-52 px-3 py-2 lg:min-w-0",
              state === "complete" && "text-foreground",
              state === "current" && "bg-accent/45 rounded-lg",
              state === "warning" && "bg-warning/5 rounded-lg",
            )}
            key={step.title}
          >
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "bg-border absolute top-8 left-12 z-0 h-px w-[calc(100%-1rem)]",
                  (state === "complete" || state === "current") && "bg-primary",
                )}
              />
            ) : null}
            <div
              className={cn(
                "bg-card relative z-10 grid size-8 place-items-center rounded-full border transition-colors duration-200",
                state === "complete" &&
                  "border-success/50 bg-success/8 text-success",
                state === "current" &&
                  "border-primary bg-primary text-primary-foreground ring-primary/10 ring-3",
                state === "warning" &&
                  "border-warning/50 bg-warning/8 text-warning",
                state === "pending" &&
                  "text-muted-foreground border-border/80 bg-card/60",
              )}
            >
              {Icon ? (
                <Icon className="size-4" />
              ) : state === "complete" ? (
                <Check className="size-4" />
              ) : (
                <Circle className="size-3" />
              )}
            </div>
            <h3 className="font-heading text-foreground mt-3 text-sm font-semibold">
              {step.title}
            </h3>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {step.detail}
            </p>
            {step.value ? (
              <p
                className={cn(
                  "mt-2 text-xs font-bold tracking-wide uppercase",
                  state === "warning"
                    ? "text-warning"
                    : state === "complete"
                      ? "text-success"
                      : "text-primary",
                )}
              >
                {step.value}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
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
    <div
      className={cn(
        "relative min-h-40 overflow-hidden p-5 sm:p-6",
        current ? "bg-success/5" : "bg-destructive/[0.035]",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1.5 rounded-r-lg transition-transform",
          current ? "bg-success" : "bg-destructive/65",
        )}
      />
      <p
        className={cn(
          "w-fit rounded-md px-2 py-1 text-[10px] font-semibold tracking-wider uppercase",
          current
            ? "bg-success/12 dark:text-success text-[oklch(0.32_0.09_165)]"
            : "bg-destructive/12 dark:text-destructive text-[oklch(0.42_0.16_25)]",
        )}
      >
        {label}
      </p>
      <p className="font-heading text-foreground mt-5 text-base leading-relaxed font-semibold text-pretty">
        {text}
      </p>
      {detail ? (
        <p className="text-muted-foreground mt-5 font-mono text-[10px] tracking-tight">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
