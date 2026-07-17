"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAppError } from "@/lib/errors/app-error";
import { requireCurrentActor } from "@/modules/identity/policy";
import {
  requestReportInput,
  type ReportActionState,
} from "@/modules/reports/contracts";
import { requestReport } from "@/modules/reports/service";

export async function requestReportAction(
  _previous: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  try {
    await requestReport(
      await requireCurrentActor(),
      requestReportInput.parse(Object.fromEntries(formData)),
    );
    revalidatePath("/app/reports");
    return {
      status: "success",
      message: "The checksummed report bundle was requested.",
    };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error)
        ? error.message
        : error instanceof z.ZodError
          ? "Choose a valid report scope and cutoff."
          : "The report bundle could not be requested.",
    };
  }
}
