import { z } from "zod";

export const sourceKinds = [
  "guideline",
  "regulation",
  "paper",
  "standard",
  "internal_policy",
] as const;

export const artifactKinds = [
  "protocol",
  "course",
  "claim_library_entry",
  "decision_doc",
  "marketing_material",
  "order_set",
  "configuration",
  "other",
] as const;

export const createCorpusInput = z.object({
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(4_000).default(""),
});

const governedDocumentMetadataInput = z.object({
  corpusId: z.string().uuid(),
  sourceId: z.string().uuid().optional(),
  artifactId: z.string().uuid().optional(),
  documentType: z.enum(["source", "artifact"]),
  sourceKind: z.enum(sourceKinds).optional(),
  artifactKind: z.enum(artifactKinds).optional(),
  title: z.string().trim().min(2).max(500),
  externalReference: z.string().trim().max(512).optional(),
  versionLabel: z.string().trim().min(1).max(128),
  effectiveAt: z.coerce.date(),
});

function validateGovernedDocumentKind(
  input: z.infer<typeof governedDocumentMetadataInput>,
  context: z.RefinementCtx,
) {
  if (input.documentType === "source" && !input.sourceKind) {
    context.addIssue({
      code: "custom",
      path: ["sourceKind"],
      message: "Choose a source kind.",
    });
  }
  if (input.documentType === "artifact" && input.sourceId) {
    context.addIssue({
      code: "custom",
      path: ["sourceId"],
      message: "Only a source document can create a source successor.",
    });
  }
  if (input.documentType === "source" && input.artifactId) {
    context.addIssue({
      code: "custom",
      path: ["artifactId"],
      message: "Only an artifact document can create an artifact successor.",
    });
  }
  if (input.documentType === "artifact" && !input.artifactKind) {
    context.addIssue({
      code: "custom",
      path: ["artifactKind"],
      message: "Choose an artifact kind.",
    });
  }
}

export const pasteDocumentInput = governedDocumentMetadataInput
  .extend({ content: z.string().min(20).max(10_000_000) })
  .superRefine(validateGovernedDocumentKind);

export type CreateCorpusInput = z.infer<typeof createCorpusInput>;
export type PasteDocumentInput = z.infer<typeof pasteDocumentInput>;

export const createUploadSessionInput = z.object({
  filename: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.coerce.number().int().positive().max(1_000_000_000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  idempotencyKey: z.string().trim().min(8).max(255),
});

export const completeUploadInput = governedDocumentMetadataInput
  .extend({
    uploadSessionId: z.string().uuid(),
    curatedDemoAcknowledged: z.boolean(),
  })
  .superRefine(validateGovernedDocumentKind);

export const completeUploadBodyInput = governedDocumentMetadataInput
  .extend({ curatedDemoAcknowledged: z.boolean() })
  .superRefine(validateGovernedDocumentKind);

export const uploadSessionResponse = z.object({
  uploadSessionId: z.string().uuid(),
  uploadUrl: z.string().url(),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.string().datetime(),
  replayed: z.boolean(),
});

export const completeUploadResponse = z.object({
  objectPath: z.string().min(1),
  documentVersionId: z.string().uuid(),
  duplicate: z.boolean(),
});

export type CreateUploadSessionInput = z.infer<typeof createUploadSessionInput>;
export type CompleteUploadInput = z.infer<typeof completeUploadInput>;

export type CorpusActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  objectPath?: string;
};

export const initialCorpusActionState: CorpusActionState = { status: "idle" };
