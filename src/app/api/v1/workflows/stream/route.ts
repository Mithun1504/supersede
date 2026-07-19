import { requireTenantActor } from "@/modules/identity/request-context";
import { listWorkflowProgress } from "@/modules/workflows";
import { getRequestId, problemResponse } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const encoder = new TextEncoder();
const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function GET(request: Request) {
  let tenant;
  try {
    ({ tenant } = await requireTenantActor());
  } catch (error) {
    return problemResponse(error, getRequestId(request), request.url);
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let previous = request.headers.get("last-event-id") ?? "";
      const startedAt = Date.now();
      try {
        while (!request.signal.aborted && Date.now() - startedAt < 25_000) {
          const runs = await listWorkflowProgress(tenant);
          const id = runs
            .map((run) => `${run.id}:${run.updatedAt.toISOString()}`)
            .join("|");
          if (id !== previous) {
            controller.enqueue(
              encoder.encode(
                `id: ${id}\nevent: workflow-progress\ndata: ${JSON.stringify({ runs })}\n\n`,
              ),
            );
            previous = id;
          } else {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          }
          await wait(2_000);
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
