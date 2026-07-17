"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import {
  assessCorrectionInput,
  classifyProbeInput,
  dismissQuoteFailureInput,
  reviewDecisionInput,
  type ReviewActionState,
} from "@/modules/review/contracts";
import {
  assessLearnerCorrection,
  classifyProbeResponse,
  decideReviewTask,
  dismissQuoteFailure,
} from "@/modules/review/service";
import { requireCurrentActor } from "@/modules/identity/policy";

export async function decideReviewTaskAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const input = reviewDecisionInput.parse(Object.fromEntries(formData));
    await decideReviewTask(await requireCurrentActor(), input);
    revalidatePath("/app/inbox");
    revalidatePath("/app/graph");
    return {
      status: "success",
      message:
        input.action === "deferred"
          ? "Review deferred."
          : `Candidate ${input.action}.`,
    };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { status: "error", message: "The review decision is invalid." };
    if (isAppError(error)) return { status: "error", message: error.message };
    return {
      status: "error",
      message: "The review decision could not be saved.",
    };
  }
}

export async function classifyProbeAction(formData: FormData): Promise<void> {
  const input = classifyProbeInput.parse(Object.fromEntries(formData));
  await classifyProbeResponse(await requireCurrentActor(), input);
  revalidatePath("/app/inbox");
}

export async function assessCorrectionAction(
  formData: FormData,
): Promise<void> {
  const input = assessCorrectionInput.parse(Object.fromEntries(formData));
  await assessLearnerCorrection(await requireCurrentActor(), input);
  revalidatePath("/app/inbox");
}

export async function dismissQuoteFailureAction(
  formData: FormData,
): Promise<void> {
  const input = dismissQuoteFailureInput.parse(Object.fromEntries(formData));
  await dismissQuoteFailure(await requireCurrentActor(), input);
  revalidatePath("/app/inbox");
}
