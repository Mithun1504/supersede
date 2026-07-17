"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import { requireCurrentActor } from "@/modules/identity/policy";
import {
  authorizeReleaseInput,
  prepareReleaseInput,
  simulateSeededPersonasInput,
  type ReleaseActionState,
} from "@/modules/releases/contracts";
import {
  authorizeRelease,
  prepareRelease,
  simulateSeededPersonaResponses,
} from "@/modules/releases/service";

export async function prepareReleaseAction(
  _previous: ReleaseActionState,
  formData: FormData,
): Promise<ReleaseActionState> {
  try {
    await prepareRelease(
      await requireCurrentActor(),
      prepareReleaseInput.parse(Object.fromEntries(formData)),
    );
    revalidatePath("/app/releases");
    return {
      status: "success",
      message:
        "Exact content and audience snapshots are awaiting authorization.",
    };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error)
        ? error.message
        : error instanceof z.ZodError
          ? "Choose a validated change and active work role."
          : "The release snapshot could not be prepared.",
    };
  }
}

export async function authorizeReleaseAction(
  formData: FormData,
): Promise<void> {
  const input = authorizeReleaseInput.parse(Object.fromEntries(formData));
  await authorizeRelease(await requireCurrentActor(), input.releaseBatchId);
  revalidatePath("/app/releases");
  revalidatePath("/app/learning");
}

export async function simulateSeededPersonasAction(formData: FormData) {
  const input = simulateSeededPersonasInput.parse(Object.fromEntries(formData));
  await simulateSeededPersonaResponses(
    await requireCurrentActor(),
    input.releaseBatchId,
  );
  revalidatePath("/app/releases");
  revalidatePath("/app/reports");
}
