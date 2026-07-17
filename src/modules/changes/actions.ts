"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import {
  createChangeInput,
  validateChangeInput,
  type ChangeActionState,
} from "@/modules/changes/contracts";
import {
  createAndSubmitChange,
  validateChange,
} from "@/modules/changes/service";
import { requireCurrentActor } from "@/modules/identity/policy";

export async function createChangeAction(
  _previous: ChangeActionState,
  formData: FormData,
): Promise<ChangeActionState> {
  try {
    const input = createChangeInput.parse(Object.fromEntries(formData));
    const id = await createAndSubmitChange(await requireCurrentActor(), input);
    revalidatePath("/app/changes");
    return {
      status: "success",
      message: "ChangeEvent submitted for independent validation.",
      objectPath: `/app/changes/${id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function validateChangeAction(formData: FormData): Promise<void> {
  const { changeEventVersionId } = validateChangeInput.parse(
    Object.fromEntries(formData),
  );
  const id = await validateChange(
    await requireCurrentActor(),
    changeEventVersionId,
  );
  revalidatePath("/app/changes");
  revalidatePath(`/app/changes/${id}`);
}

function actionError(error: unknown): ChangeActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: "Review the ChangeEvent fields.",
      fieldErrors: z.flattenError(error).fieldErrors,
    };
  if (isAppError(error)) return { status: "error", message: error.message };
  return { status: "error", message: "The ChangeEvent could not be saved." };
}
