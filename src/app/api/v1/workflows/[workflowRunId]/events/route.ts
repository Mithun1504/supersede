import { and, eq } from "drizzle-orm";

import { workflowRuns } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { getRequestId, problemResponse } from "@/lib/api/responses";
import { AppError } from "@/lib/errors/app-error";
import { authorize, requireCurrentActor } from "@/modules/identity/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const terminal = new Set(["completed", "partial", "failed", "cancelled"]);
const encoder = new TextEncoder();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workflowRunId: string }> },
) {
  const requestId = getRequestId(request);
  const path = new URL(request.url).pathname;
  try {
    const actor = await requireCurrentActor();
    authorize(actor, "operations.read");
    const { workflowRunId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(workflowRunId))
      return problemResponse(
        new AppError({
          code: "VALIDATION_FAILED",
          message: "Invalid workflow identifier.",
          status: 422,
        }),
        requestId,
        path,
      );

    const readProjection = () =>
      withTenantContext(
        {
          organizationId: actor.organization.id,
          actorMembershipId: actor.membership.id,
        },
        async (transaction) => {
          const [run] = await transaction
            .select({
              id: workflowRuns.id,
              status: workflowRuns.status,
              progressCurrent: workflowRuns.progressCurrent,
              progressTotal: workflowRuns.progressTotal,
              errorCode: workflowRuns.errorCode,
              updatedAt: workflowRuns.updatedAt,
            })
            .from(workflowRuns)
            .where(
              and(
                eq(workflowRuns.id, workflowRunId),
                eq(workflowRuns.organizationId, actor.organization.id),
              ),
            )
            .limit(1);
          return run ?? null;
        },
      );
    if (!(await readProjection()))
      return new Response(null, {
        status: 404,
        headers: { "x-request-id": requestId },
      });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let previous = "";
        try {
          for (let iteration = 0; iteration < 25; iteration += 1) {
            if (request.signal.aborted) break;
            const projection = await readProjection();
            if (!projection) break;
            const payload = JSON.stringify(projection);
            if (payload !== previous) {
              controller.enqueue(
                encoder.encode(`event: workflow\ndata: ${payload}\n\n`),
              );
              previous = payload;
            } else controller.enqueue(encoder.encode(": keep-alive\n\n"));
            if (terminal.has(projection.status)) break;
            await new Promise((resolve) => setTimeout(resolve, 2_000));
          }
        } catch {
          controller.enqueue(encoder.encode("event: reconnect\ndata: {}\n\n"));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return problemResponse(error, requestId, path);
  }
}
