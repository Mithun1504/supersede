"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import {
  approveCaseInput,
  approveExerciseInput,
  createCaseInput,
  generateCasesInput,
  retireCaseInput,
  type CaseActionState,
} from "@/modules/cases/contracts";
import {
  approveDivergenceCase,
  approveCorrectionExercise,
  createDivergenceCase,
  retireDivergenceCase,
} from "@/modules/cases/service";
import { generateDivergenceCases } from "@/modules/cases/generation";
import { requireCurrentActor } from "@/modules/identity/policy";

export async function createCaseAction(
  _previous: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  try {
    await createDivergenceCase(
      await requireCurrentActor(),
      createCaseInput.parse(Object.fromEntries(formData)),
    );
    revalidatePath("/app/cases");
    return {
      status: "success",
      message: "Case created for independent approval.",
    };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error)
        ? error.message
        : error instanceof z.ZodError
          ? "Review the case fields."
          : "The case could not be created.",
    };
  }
}
export async function retireCaseAction(
  _previous: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  try {
    const input = retireCaseInput.parse(Object.fromEntries(formData));
    await retireDivergenceCase(await requireCurrentActor(), input);
    revalidatePath("/app/cases");
    revalidatePath("/app/reports");
    return {
      status: "success",
      message: "The exact case version was retired.",
    };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error)
        ? error.message
        : error instanceof z.ZodError
          ? "Provide a retirement reason and rationale."
          : "The case could not be retired.",
    };
  }
}
export async function generateCasesAction(
  _previous: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  try {
    const input = generateCasesInput.parse(Object.fromEntries(formData));
    const result = await generateDivergenceCases(
      await requireCurrentActor(),
      input.changeEventVersionId,
    );
    revalidatePath("/app/cases");
    return {
      status: "success",
      message: result.replayed
        ? "The governed generation run was already completed."
        : `${result.created} cited case drafts generated for human review.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error)
        ? error.message
        : error instanceof z.ZodError
          ? "Choose a validated ChangeEvent."
          : "Case generation could not be completed.",
    };
  }
}
export async function approveExerciseAction(formData: FormData): Promise<void> {
  const { exerciseVersionId } = approveExerciseInput.parse(
    Object.fromEntries(formData),
  );
  await approveCorrectionExercise(
    await requireCurrentActor(),
    exerciseVersionId,
  );
  revalidatePath("/app/cases");
}
export async function approveCaseAction(formData: FormData): Promise<void> {
  const { caseVersionId } = approveCaseInput.parse(
    Object.fromEntries(formData),
  );
  await approveDivergenceCase(await requireCurrentActor(), caseVersionId);
  revalidatePath("/app/cases");
}
