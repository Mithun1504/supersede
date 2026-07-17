"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import {
  submitProbeInput,
  submitRemediationInput,
  type LearningActionState,
} from "@/modules/learning/contracts";
import { submitLearnerProbe } from "@/modules/learning/service";
import { submitRemediation } from "@/modules/learning/remediation-service";
import { requireCurrentActor } from "@/modules/identity/policy";

export async function submitProbeAction(
  _previous: LearningActionState,
  formData: FormData,
): Promise<LearningActionState> {
  try {
    const input = submitProbeInput.parse(Object.fromEntries(formData));
    const label = await submitLearnerProbe(await requireCurrentActor(), input);
    revalidatePath("/app/learning");
    revalidatePath(`/app/learning/probes/${input.probeAssignmentId}`);
    return {
      status: "success",
      message:
        label === "old"
          ? "Response recorded. A correction activity is ready on your learning home."
          : label === "other"
            ? "Response recorded for a human assessor."
            : "Response recorded. No correction is required.",
    };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error)
        ? error.message
        : error instanceof z.ZodError
          ? "Choose one response before submitting."
          : "Your response could not be recorded.",
    };
  }
}

export async function submitRemediationAction(
  _previous: LearningActionState,
  formData: FormData,
): Promise<LearningActionState> {
  try {
    const input = submitRemediationInput.parse(Object.fromEntries(formData));
    const outcome = await submitRemediation(await requireCurrentActor(), input);
    revalidatePath("/app/learning");
    revalidatePath(
      `/app/learning/remediations/${input.remediationAssignmentId}`,
    );
    return {
      status: "success",
      message:
        outcome === "passed"
          ? "Correction passed. Your 30- and 90-day checks are scheduled."
          : outcome === "failed"
            ? "Review the cited feedback and submit another corrected work product."
            : "Your work is queued for human review.",
    };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error)
        ? error.message
        : error instanceof z.ZodError
          ? "Provide a complete corrected work product."
          : "The correction could not be submitted.",
    };
  }
}
