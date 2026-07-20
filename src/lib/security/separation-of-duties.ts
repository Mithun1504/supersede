import { AppError } from "@/lib/errors/app-error";

export function actorsAreDistinct(
  firstActorId: string,
  secondActorId: string,
): boolean {
  return firstActorId !== secondActorId;
}

export function requireDistinctActors(
  firstActorId: string,
  secondActorId: string,
  rule: string,
): void {
  if (!actorsAreDistinct(firstActorId, secondActorId)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Separation of duties required.",
      detail: rule,
      status: 403,
    });
  }
}
