"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import { pasteDocumentInput } from "@/modules/corpus/contracts";
import { ingestPastedDocument } from "@/modules/corpus/service";
import {
  submitArtifactRemediation,
  verifyArtifactRemediation,
} from "@/modules/changes/remediation";
import { requireCurrentActor } from "@/modules/identity/policy";

export type RemediationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function createRemediationSuccessorAction(
  _previous: RemediationActionState,
  formData: FormData,
): Promise<RemediationActionState> {
  try {
    const remediationId = z
      .string()
      .uuid()
      .parse(formData.get("remediationId"));
    const input = pasteDocumentInput.parse(Object.fromEntries(formData));
    const actor = await requireCurrentActor();
    const result = await ingestPastedDocument(actor, input);
    await submitArtifactRemediation(
      actor,
      remediationId,
      result.objectVersionId,
    );
    revalidatePath("/app/remediations");
    revalidatePath(`/app/artifacts/${result.objectId}`);
    return {
      status: "success",
      message: "Successor submitted for independent verification.",
    };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { status: "error", message: "Review the successor fields." };
    if (isAppError(error)) return { status: "error", message: error.message };
    return {
      status: "error",
      message: "The remediation could not be submitted.",
    };
  }
}

export async function verifyRemediationAction(
  formData: FormData,
): Promise<void> {
  const remediationId = z.string().uuid().parse(formData.get("remediationId"));
  await verifyArtifactRemediation(await requireCurrentActor(), remediationId);
  revalidatePath("/app/remediations");
}
