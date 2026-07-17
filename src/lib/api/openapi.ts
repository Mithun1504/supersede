import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { registerArtifactAndAuditPaths } from "@/lib/api/openapi/artifact-audit";
import { registerOpenApiSchemas } from "@/lib/api/openapi/schemas";
import { registerSystemAiAndCorpusPaths } from "@/lib/api/openapi/system-ai-corpus";
import { registerWorkflowPaths } from "@/lib/api/openapi/workflow";

extendZodWithOpenApi(z);

export function createOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registerOpenApiSchemas(registry);
  registerSystemAiAndCorpusPaths(registry);
  registerWorkflowPaths(registry);
  registerArtifactAndAuditPaths(registry);

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
