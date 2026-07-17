"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import {
  importPeopleInput,
  mapRoleArtifactInput,
  type PeopleActionState,
} from "@/modules/people/contracts";
import { importPeople, mapRoleToArtifact } from "@/modules/people/service";
import { requireCurrentActor } from "@/modules/identity/policy";

const fail = (error: unknown): PeopleActionState => ({
  status: "error",
  message: isAppError(error)
    ? error.message
    : error instanceof z.ZodError
      ? "Review the people-management fields."
      : "The people change could not be saved.",
});

export async function importPeopleAction(
  _previous: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  try {
    const input = importPeopleInput.parse(Object.fromEntries(formData));
    const result = await importPeople(await requireCurrentActor(), input);
    revalidatePath("/app/people");
    return {
      status: "success",
      message: `${input.mode === "preview" ? "Previewed" : "Processed"} ${result.people} people across ${result.roles} roles; ${result.failed} rows need correction.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function mapRoleArtifactAction(
  _previous: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  try {
    const input = mapRoleArtifactInput.parse(Object.fromEntries(formData));
    await mapRoleToArtifact(await requireCurrentActor(), input);
    revalidatePath("/app/people");
    return {
      status: "success",
      message: "Potential-exposure mapping accepted.",
    };
  } catch (error) {
    return fail(error);
  }
}
