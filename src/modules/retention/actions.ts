"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import { requireCurrentActor } from "@/modules/identity/policy";
import {
  createLegalHoldInput,
  dispositionInput,
  legalHoldIdInput,
  saveRetentionPolicyInput,
  type RetentionActionState,
} from "@/modules/retention/contracts";
import {
  createLegalHold,
  releaseLegalHold,
  runReportDisposition,
  saveReportRetentionPolicy,
} from "@/modules/retention/service";

const failure = (error: unknown): RetentionActionState => ({
  status: "error",
  message: isAppError(error)
    ? error.message
    : error instanceof z.ZodError
      ? "Review the retention control fields."
      : "The retention control could not be saved.",
});

export async function saveRetentionPolicyAction(
  _previous: RetentionActionState,
  formData: FormData,
): Promise<RetentionActionState> {
  try {
    await saveReportRetentionPolicy(
      await requireCurrentActor(),
      saveRetentionPolicyInput.parse(Object.fromEntries(formData)),
    );
    revalidatePath("/app/admin/retention");
    return {
      status: "success",
      message: "A new approved policy version was recorded.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function createLegalHoldAction(
  _previous: RetentionActionState,
  formData: FormData,
): Promise<RetentionActionState> {
  try {
    await createLegalHold(
      await requireCurrentActor(),
      createLegalHoldInput.parse(Object.fromEntries(formData)),
    );
    revalidatePath("/app/admin/retention");
    return { status: "success", message: "Legal hold activated." };
  } catch (error) {
    return failure(error);
  }
}

export async function releaseLegalHoldAction(formData: FormData) {
  const input = legalHoldIdInput.parse(Object.fromEntries(formData));
  await releaseLegalHold(await requireCurrentActor(), input.legalHoldId);
  revalidatePath("/app/admin/retention");
}

export async function dispositionAction(formData: FormData) {
  const input = dispositionInput.parse(Object.fromEntries(formData));
  await runReportDisposition(
    await requireCurrentActor(),
    input.retentionPolicyId,
    formData.get("mode") === "execute",
  );
  revalidatePath("/app/admin/retention");
  revalidatePath("/app/reports");
}
