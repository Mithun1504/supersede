import { z } from "zod";

export const saveRetentionPolicyInput = z.object({
  retentionDays: z.coerce.number().int().min(1).max(3650),
  retentionMode: z.enum(["governance", "compliance"]),
  dispositionAction: z.enum(["delete", "retain"]),
});

export const createLegalHoldInput = z.object({
  scopeType: z.enum(["organization", "report_bundle"]),
  scopeId: z.string().uuid(),
  reason: z.string().trim().min(10).max(4000),
  reference: z.string().trim().min(3).max(255),
});

export const legalHoldIdInput = z.object({ legalHoldId: z.string().uuid() });
export const dispositionInput = z.object({
  retentionPolicyId: z.string().uuid(),
});

export type RetentionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};
export const initialRetentionActionState: RetentionActionState = {
  status: "idle",
};
