"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type WorkflowRun = {
  id: string;
  workflowName: string;
  status:
    "queued" | "running" | "partial" | "failed" | "completed" | "quota_paused";
  progressCurrent: number;
  progressTotal: number;
};

const visibleWorkflowStatuses = new Set<WorkflowRun["status"]>([
  "queued",
  "running",
  "partial",
  "failed",
  "quota_paused",
]);

export function RealtimeRefresh({
  authenticated = false,
  intervalMs = 15_000,
}: {
  authenticated?: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  useEffect(() => {
    const abortController = new AbortController();
    const load = async () => {
      if (!authenticated) return;
      try {
        const response = await fetch("/api/v1/workflows", {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { runs?: WorkflowRun[] };
        setRuns(payload.runs ?? []);
      } catch (error) {
        if (!abortController.signal.aborted) console.warn(error);
      }
    };
    const refresh = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        void load();
      }
    };
    let interval: number | undefined;
    let events: EventSource | undefined;
    if (authenticated && "EventSource" in window) {
      events = new EventSource("/api/v1/workflows/stream");
      events.addEventListener("workflow-progress", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent<string>).data) as {
            runs?: WorkflowRun[];
          };
          setRuns(payload.runs ?? []);
          refresh();
        } catch {
          void load();
        }
      });
      events.onerror = () => {
        events?.close();
        events = undefined;
        interval ??= window.setInterval(refresh, intervalMs);
      };
    } else {
      interval = window.setInterval(refresh, intervalMs);
    }
    window.addEventListener("focus", refresh);
    void load();
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
      abortController.abort();
      events?.close();
      window.removeEventListener("focus", refresh);
    };
  }, [authenticated, intervalMs, router]);
  if (!authenticated) return null;
  const current =
    runs.find((run) => visibleWorkflowStatuses.has(run.status)) ?? runs[0];
  if (!current) return null;
  const failure =
    current.status === "failed" || current.status === "quota_paused";
  const progress = current.progressTotal
    ? Math.min(100, (current.progressCurrent / current.progressTotal) * 100)
    : 0;
  return (
    <div
      aria-live="polite"
      className={
        failure
          ? "border-destructive/30 bg-destructive/5 text-destructive hidden min-w-40 rounded-md border px-3 py-1.5 lg:block"
          : "border-border bg-muted/40 text-muted-foreground hidden min-w-40 rounded-md border px-3 py-1.5 lg:block"
      }
    >
      <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
        <span className="max-w-28 truncate">{current.workflowName}</span>
        <span>{current.status.replace("_", " ")}</span>
      </div>
      <div className="bg-border mt-1 h-1 overflow-hidden rounded-full">
        <div
          className={failure ? "bg-destructive h-full" : "bg-primary h-full"}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
