import { Button } from "@/components/ui/button";
import { dismissQuoteFailureAction } from "@/modules/review/actions";

export function QuoteFailureForm({ reviewTaskId }: { reviewTaskId: string }) {
  return (
    <form action={dismissQuoteFailureAction} className="space-y-3">
      <input type="hidden" name="reviewTaskId" value={reviewTaskId} />
      <label className="block text-xs font-medium">
        Resolution note
        <input
          name="reason"
          required
          minLength={3}
          maxLength={2000}
          defaultValue="Model quote could not be located in immutable source text."
          className="border-input bg-background mt-1 h-9 w-full rounded-lg border px-3 text-sm"
        />
      </label>
      <Button type="submit" size="sm" variant="destructive">
        Dismiss invalid model output
      </Button>
      <p className="text-muted-foreground text-xs">
        This resolves the queue item without creating evidence, a claim, or an
        authoritative graph edge. Rerun extraction after correcting the source
        when a replacement is needed.
      </p>
    </form>
  );
}
