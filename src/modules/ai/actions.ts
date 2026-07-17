"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import { startExtractionInput } from "@/modules/ai/contracts";
import { extractClaims } from "@/modules/ai/extraction";
import { requireCurrentActor } from "@/modules/identity/policy";

export type ExtractionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  extractionRunId?: string;
};

export async function startExtractionAction(
  _previous: ExtractionActionState,
  formData: FormData,
): Promise<ExtractionActionState> {
  try {
    const { artifactVersionId } = startExtractionInput.parse(
      Object.fromEntries(formData),
    );
    const actor = await requireCurrentActor();
    const result = await extractClaims(actor, artifactVersionId);
    revalidatePath("/app/inbox");
    revalidatePath("/app/artifacts");
    return {
      status: "success",
      extractionRunId: result.extractionRunId,
      message: result.replayed
        ? `Existing extraction loaded: ${result.claimsSuggested} claims.`
        : `Extraction completed: ${result.claimsSuggested} claims proposed${result.quotesFailed ? `; ${result.quotesFailed} quotes require attention` : ""}.`,
    };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { status: "error", message: "The artifact version is invalid." };
    if (isAppError(error)) return { status: "error", message: error.message };
    return {
      status: "error",
      message: "Claim extraction could not be completed.",
    };
  }
}
