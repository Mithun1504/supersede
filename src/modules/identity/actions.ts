"use server";

import { signOut } from "@workos-inc/authkit-nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isWorkOSConfigured } from "@/lib/env/server";
import { isAppError } from "@/lib/errors/app-error";
import {
  approvalPolicyUpdateInput,
  type IdentityActionState,
  organizationSettingsInput,
  roleGrantInput,
  roleRevokeInput,
} from "@/modules/identity/contracts";
import {
  requireAuthContext,
  requireRecentAuthentication,
} from "@/modules/identity/auth";
import { requireCurrentActor } from "@/modules/identity/policy";
import {
  grantMembershipRole,
  revokeMembershipRole,
  updateOrganizationSettings,
  updateApprovalPolicy,
} from "@/modules/identity/service";

function errorState(error: unknown): IdentityActionState {
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      message: "Review the highlighted values and try again.",
      fieldErrors: z.flattenError(error).fieldErrors,
    };
  }
  if (isAppError(error)) {
    return { status: "error", message: error.message };
  }
  return {
    status: "error",
    message: "The change could not be saved. Try again.",
  };
}

export async function updateOrganizationSettingsAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  try {
    const input = organizationSettingsInput.parse(Object.fromEntries(formData));
    await requireRecentAuthentication();
    const actor = await requireCurrentActor();
    await updateOrganizationSettings(actor, input);
    revalidatePath("/app");
    revalidatePath("/app/admin/organization");
    return { status: "success", message: "Organization policy saved." };
  } catch (error) {
    return errorState(error);
  }
}

export async function grantMembershipRoleAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  try {
    const input = roleGrantInput.parse(Object.fromEntries(formData));
    await requireRecentAuthentication();
    const actor = await requireCurrentActor();
    await grantMembershipRole(actor, input);
    revalidatePath("/app/admin/members");
    return { status: "success", message: "Role granted." };
  } catch (error) {
    return errorState(error);
  }
}

export async function revokeMembershipRoleAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  try {
    const input = roleRevokeInput.parse(Object.fromEntries(formData));
    await requireRecentAuthentication();
    const actor = await requireCurrentActor();
    await revokeMembershipRole(actor, input);
    revalidatePath("/app/admin/members");
    return { status: "success", message: "Role revoked." };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateApprovalPolicyAction(
  _previous: IdentityActionState,
  formData: FormData,
): Promise<IdentityActionState> {
  try {
    const input = approvalPolicyUpdateInput.parse({
      policyId: formData.get("policyId"),
      minimumApprovals: formData.get("minimumApprovals"),
      requireDistinctCreator: formData.has("requireDistinctCreator"),
      requireDistinctRequester: formData.has("requireDistinctRequester"),
      requireRecentAuth: formData.has("requireRecentAuth"),
      requireMfa: formData.has("requireMfa"),
      eligibleRoleCodes: formData.getAll("eligibleRoleCodes"),
    });
    await requireRecentAuthentication();
    const actor = await requireCurrentActor();
    await updateApprovalPolicy(actor, input);
    revalidatePath("/app/admin/policies");
    return {
      status: "success",
      message: "A new approval policy version is active.",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function signOutAction() {
  if (isWorkOSConfigured()) {
    await requireAuthContext();
    await signOut();
  }
}
