"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import {
  createCorpusInput,
  pasteDocumentInput,
  type CorpusActionState,
} from "@/modules/corpus/contracts";
import { createCorpus, ingestPastedDocument } from "@/modules/corpus/service";
import {
  approveArtifactVersion,
  approveSourceVersion,
} from "@/modules/corpus/governance";
import { requireCurrentActor } from "@/modules/identity/policy";

function errorState(error: unknown): CorpusActionState {
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      message: "Review the highlighted fields.",
      fieldErrors: z.flattenError(error).fieldErrors,
    };
  }
  if (isAppError(error)) return { status: "error", message: error.message };
  return {
    status: "error",
    message: "The content could not be saved. Try again.",
  };
}

export async function approveSourceVersionAction(
  formData: FormData,
): Promise<void> {
  const sourceVersionId = z
    .string()
    .uuid()
    .parse(formData.get("sourceVersionId"));
  const actor = await requireCurrentActor();
  const sourceId = await approveSourceVersion(actor, sourceVersionId);
  revalidatePath(`/app/sources/${sourceId}`);
  revalidatePath("/app/changes");
}

export async function approveArtifactVersionAction(
  formData: FormData,
): Promise<void> {
  const artifactVersionId = z
    .string()
    .uuid()
    .parse(formData.get("artifactVersionId"));
  const artifactId = await approveArtifactVersion(
    await requireCurrentActor(),
    artifactVersionId,
  );
  revalidatePath(`/app/artifacts/${artifactId}`);
  revalidatePath("/app/graph");
}

export async function createCorpusAction(
  _previous: CorpusActionState,
  formData: FormData,
): Promise<CorpusActionState> {
  try {
    const input = createCorpusInput.parse(Object.fromEntries(formData));
    const actor = await requireCurrentActor();
    const corpusId = await createCorpus(actor, input);
    revalidatePath("/app/corpus");
    return {
      status: "success",
      message: "Corpus created.",
      objectPath: `/app/corpus/${corpusId}`,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function ingestPastedDocumentAction(
  _previous: CorpusActionState,
  formData: FormData,
): Promise<CorpusActionState> {
  try {
    const input = pasteDocumentInput.parse(Object.fromEntries(formData));
    const actor = await requireCurrentActor();
    const result = await ingestPastedDocument(actor, input);
    revalidatePath("/app/corpus");
    revalidatePath(`/app/corpus/${input.corpusId}`);
    return {
      status: "success",
      message: result.duplicate
        ? "Content linked to the existing immutable document hash."
        : "Content ingested and queued for extraction.",
      objectPath: result.objectPath,
    };
  } catch (error) {
    return errorState(error);
  }
}
