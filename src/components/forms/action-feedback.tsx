import { Alert, AlertDescription } from "@/components/ui/alert";
import type { IdentityActionState } from "@/modules/identity/contracts";

export function ActionFeedback({ state }: { state: IdentityActionState }) {
  if (state.status === "idle" || !state.message) return null;

  return (
    <Alert
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "border-destructive/40 text-destructive"
          : "border-success/40"
      }
    >
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
