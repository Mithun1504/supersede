import { z } from "zod";

export const aiRunProvenanceSchema = z.object({
  provider: z.enum(["openai", "google"]),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  sourceHashes: z.array(z.string().min(1)),
  retrievalChunkIds: z.array(z.string().uuid()),
  externalResponseId: z.string().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative(),
  validated: z.boolean(),
});

export type AiRunProvenance = z.infer<typeof aiRunProvenanceSchema>;
