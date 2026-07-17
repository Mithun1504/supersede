"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentActor } from "@/modules/identity/policy";
import {
  markNotificationRead,
  setNotificationChannelPreference,
} from "@/modules/notifications/service";

const inputSchema = z.object({
  notificationId: z.string().uuid(),
  actionPath: z
    .string()
    .startsWith("/")
    .refine((value) => !value.startsWith("//")),
});

export async function openNotificationAction(formData: FormData) {
  const input = inputSchema.parse(Object.fromEntries(formData));
  await markNotificationRead(await requireCurrentActor(), input.notificationId);
  revalidatePath("/app/notifications");
  redirect(input.actionPath);
}

const preferenceSchema = z.object({
  channel: z.enum(["email", "slack"]),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export async function setNotificationPreferenceAction(formData: FormData) {
  const input = preferenceSchema.parse(Object.fromEntries(formData));
  await setNotificationChannelPreference(
    await requireCurrentActor(),
    input.channel,
    input.enabled,
  );
  revalidatePath("/app/notifications");
}
