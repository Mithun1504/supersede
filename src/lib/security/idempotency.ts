import { AppError } from "@/lib/errors/app-error";

export function assertIdempotencyActor(
  payload: Record<string, unknown>,
  actorMembershipId: string,
) {
  if (payload.actorMembershipId !== actorMembershipId) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "This idempotency key belongs to a different actor.",
      status: 403,
    });
  }
}
