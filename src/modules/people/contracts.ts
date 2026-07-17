import { z } from "zod";

export const importPeopleInput = z.object({
  rows: z.string().trim().min(3).max(200_000),
  deprovisionMissing: z.preprocess(
    (value) => value === "on" || value === "true",
    z.boolean(),
  ),
  mode: z.enum(["preview", "apply"]),
});

export const mapRoleArtifactInput = z.object({
  workRoleId: z.string().uuid(),
  artifactId: z.string().uuid(),
  rationale: z.string().trim().min(3).max(2_000),
});

export type PeopleActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};
export const initialPeopleActionState: PeopleActionState = { status: "idle" };
