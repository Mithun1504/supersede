import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { healthResponseSchema } from "@/app/api/v1/health/route";
import { problemDetailsSchema } from "@/lib/api/problem-details";

extendZodWithOpenApi(z);

export function createOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.register("ProblemDetails", problemDetailsSchema);
  registry.registerPath({
    method: "get",
    path: "/api/v1/health",
    summary: "Report application liveness and provider configuration",
    tags: ["System"],
    responses: {
      200: {
        description: "Application is running.",
        content: {
          "application/json": { schema: healthResponseSchema },
        },
      },
    },
  });

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Supersede API",
      version: "0.1.0",
      description: "Versioned REST contracts for Supersede integrations.",
    },
    servers: [{ url: "/" }],
  });
}
