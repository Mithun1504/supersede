import { z } from "zod";

import { roleCodes } from "@/modules/identity/permissions";

const timezone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Enter a valid IANA timezone, such as America/New_York." },
  );

export const organizationSettingsInput = z.object({
  defaultTimezone: timezone,
  locale: z.string().trim().min(2).max(16),
  individualResultPolicy: z.enum(["aggregate_only", "authorized_individual"]),
  minimumAggregateCohortSize: z.coerce.number().int().min(2).max(10_000),
  reviewConfidenceThreshold: z.coerce.number().min(0).max(1),
  maxGraphDepth: z.coerce.number().int().min(1).max(50),
});

export type OrganizationSettingsInput = z.infer<
  typeof organizationSettingsInput
>;

export const roleGrantInput = z.object({
  membershipId: z.string().uuid(),
  roleCode: z.enum(roleCodes),
});

export const roleRevokeInput = roleGrantInput.extend({
  reason: z.string().trim().min(3).max(500),
});

export const approvalPolicyUpdateInput = z.object({
  policyId: z.string().uuid(),
  minimumApprovals: z.coerce.number().int().min(1).max(5),
  requireDistinctCreator: z.boolean(),
  requireDistinctRequester: z.boolean(),
  requireRecentAuth: z.boolean(),
  requireMfa: z.boolean(),
  eligibleRoleCodes: z.array(z.enum(roleCodes)).min(1),
});

export type ApprovalPolicyUpdateInput = z.infer<
  typeof approvalPolicyUpdateInput
>;

export type IdentityActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialIdentityActionState: IdentityActionState = {
  status: "idle",
};
