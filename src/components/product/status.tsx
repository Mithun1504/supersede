import type React from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "plum";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-[0.35rem] border px-2 py-0.5 text-xs font-bold",
        tone === "success" &&
          "border-success/25 bg-success/8 dark:text-success text-[oklch(0.39_0.09_158)]",
        tone === "warning" &&
          "border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning",
        tone === "danger" &&
          "border-destructive/25 bg-destructive/8 dark:text-destructive text-[oklch(0.42_0.14_25)]",
        tone === "plum" && "border-primary/25 bg-primary/8 text-primary",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const boundedValue = Math.max(0, Math.min(100, value));
  const reviewPriority =
    boundedValue < 70 ? "high" : boundedValue < 90 ? "medium" : "low";

  return (
    <div
      className="flex min-w-36 items-center gap-3"
      aria-label={`Evidence confidence ${boundedValue}%; ${reviewPriority} review priority`}
    >
      <progress
        className="bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary h-1.5 flex-1 appearance-none overflow-hidden rounded-full"
        max={100}
        value={boundedValue}
      />
      <span className="text-muted-foreground w-[4.75rem] text-right text-xs tabular-nums">
        {boundedValue}% evidence
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-border grid min-h-48 place-items-center border-y px-4 py-10 text-center">
      <div className="max-w-sm">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">{detail}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function LoadingRows() {
  return (
    <div className="border-border border-y" aria-label="Loading product data">
      {[0, 1, 2].map((row) => (
        <div
          className="border-border grid animate-pulse grid-cols-[minmax(8rem,0.4fr)_1fr] gap-6 border-b px-4 py-5 last:border-b-0 sm:px-6"
          key={row}
        >
          <div className="bg-muted h-3 w-2/3 rounded" />
          <div className="bg-muted h-3 w-full max-w-md rounded" />
        </div>
      ))}
    </div>
  );
}

export function ErrorNotice({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="border-destructive/35 bg-destructive/8 text-foreground border-y px-4 py-4">
      <div className="flex gap-3">
        <CircleAlert
          className="text-destructive mt-0.5 size-5 shrink-0"
          aria-hidden="true"
        />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export function WorkState({ label }: { label: string }) {
  return (
    <span className="text-success inline-flex items-center gap-1.5 text-sm font-medium">
      <Check className="size-4" aria-hidden="true" />
      {label}
    </span>
  );
}

export function PendingState({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}
