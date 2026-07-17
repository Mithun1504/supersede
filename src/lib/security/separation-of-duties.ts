import { AppError } from "@/lib/errors/app-error";

export function requireDistinctActors(
  firstActorId: string,
  secondActorId: string,
  rule: string,
): void {
  if (firstActorId === secondActorId) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Separation of duties required.",
      detail: rule,
      status: 403,
    });
  }
}
