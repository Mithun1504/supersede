import "server-only";

import { SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("supersede-web");

export async function withSpan<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
