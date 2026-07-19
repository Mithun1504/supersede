import { describe, expect, it } from "vitest";

import { toProblemDetails } from "@/lib/api/problem-details";
import { AppError } from "@/lib/errors/app-error";

describe("toProblemDetails", () => {
  it("exposes an intentional application error", () => {
    const problem = toProblemDetails(
      new AppError({
        code: "CONFLICT",
        message: "The object version is stale.",
        status: 409,
      }),
      "request-123",
      "/api/v1/example",
    );

    expect(problem).toMatchObject({
      code: "CONFLICT",
      requestId: "request-123",
      status: 409,
      title: "The object version is stale.",
      type: "urn:supersede:problem:conflict",
    });
  });

  it("does not leak unexpected error messages", () => {
    const problem = toProblemDetails(
      new Error("secret database detail"),
      "request-456",
    );

    expect(problem.title).toBe("An unexpected error occurred.");
    expect(problem).not.toHaveProperty("detail");
  });
});
