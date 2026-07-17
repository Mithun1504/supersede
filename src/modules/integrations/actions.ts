"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import {
  configureIntegrationInput,
  disableIntegrationInput,
  type IntegrationActionState,
} from "@/modules/integrations/contracts";
import {
  configureIntegration,
  disableIntegration,
} from "@/modules/integrations/service";
import { requireCurrentActor } from "@/modules/identity/policy";

export async function configureIntegrationAction(
  _previous: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  try {
    const input = configureIntegrationInput.parse(Object.fromEntries(formData));
    await configureIntegration(await requireCurrentActor(), input);
    revalidatePath("/app/admin/integrations");
    return { status: "success", message: "Connection verified and activated." };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error)
        ? error.message
        : error instanceof z.ZodError
          ? "Review the connection fields."
          : error instanceof Error
            ? error.message
            : "The connection could not be activated.",
    };
  }
}

export async function disableIntegrationAction(formData: FormData) {
  const input = disableIntegrationInput.parse(Object.fromEntries(formData));
  await disableIntegration(await requireCurrentActor(), input.connectionId);
  revalidatePath("/app/admin/integrations");
}
