import type React from "react";
import { CheckCircle2, CircleAlert, Inbox, Loader2 } from "lucide-react";

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
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold tracking-[0.05em] uppercase",
        tone === "success" &&
          "border-success/20 bg-success/8 dark:text-success text-[oklch(0.42_0.1_160)]",
        tone === "warning" &&
          "border-warning/25 bg-warning/10 text-warning-foreground dark:text-warning",
        tone === "danger" &&
          "border-destructive/20 bg-destructive/8 dark:text-destructive text-[oklch(0.42_0.16_25)]",
        tone === "plum" && "border-primary/20 bg-primary/8 text-primary",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          tone === "neutral" && "opacity-55",
        )}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const boundedValue = Math.max(0, Math.min(100, value));
  return (
    <div
      className="flex min-w-32 items-center gap-3"
      aria-label={`Confidence ${boundedValue}%`}
    >
      <div
        className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${boundedValue}%` }}
        />
      </div>
      <span className="text-muted-foreground w-10 text-xs tabular-nums">
        {boundedValue}%
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
    <div className="grid min-h-48 place-items-center px-4 py-8 text-center">
      <div className="max-w-sm space-y-3">
        <div className="bg-primary/10 text-primary mx-auto grid size-12 place-items-center rounded-full">
          <Inbox className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm leading-6">{detail}</p>
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}

export function LoadingRows() {
  return (
    <div className="space-y-3" aria-label="Loading product data">
      {[0, 1, 2].map((row) => (
        <div
          className="border-border bg-card flex animate-pulse gap-4 rounded-lg border p-4"
          key={row}
        >
          <div className="bg-muted size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="bg-muted h-4 w-2/3 rounded" />
            <div className="bg-muted h-3 w-1/2 rounded" />
          </div>
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
    <div className="border-destructive/30 bg-destructive/10 text-foreground rounded-lg border p-4">
      <div className="flex gap-3">
        <CircleAlert
          className="text-destructive mt-0.5 size-5 shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm leading-6">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export function WorkState({ label }: { label: string }) {
  return (
    <span className="text-success inline-flex items-center gap-1.5 text-sm font-medium">
      <CheckCircle2 className="size-4" aria-hidden="true" />
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
