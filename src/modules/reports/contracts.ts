import { z } from "zod";

export const requestReportInput = z.object({
  changeEventVersionId: z.string().uuid(),
  cutoff: z.coerce.date().refine((value) => value <= new Date(), {
    message: "Report cutoff cannot be in the future.",
  }),
  idempotencyKey: z.string().uuid(),
});

export type ReportActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialReportActionState: ReportActionState = { status: "idle" };
