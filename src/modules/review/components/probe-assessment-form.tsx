import { Button } from "@/components/ui/button";
import { classifyProbeAction } from "@/modules/review/actions";

export function ProbeAssessmentForm({
  reviewTaskId,
  response,
}: {
  reviewTaskId: string;
  response: string;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-muted rounded-xl p-4">
        <p className="text-muted-foreground text-xs">Selected response</p>
        <p className="mt-1 text-sm font-medium">{response}</p>
      </div>
      <form action={classifyProbeAction} className="space-y-3">
        <input type="hidden" name="reviewTaskId" value={reviewTaskId} />
        <label className="block text-xs font-medium">
          Assessment rationale
          <textarea
            name="rationale"
            required
            minLength={10}
            maxLength={4000}
            className="border-input bg-background mt-1 min-h-20 w-full rounded-lg border p-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="label" value="old" size="sm">
            Classify old-rule
          </Button>
          <Button
            type="submit"
            name="label"
            value="new"
            size="sm"
            variant="secondary"
          >
            Classify new-rule
          </Button>
          <Button
            type="submit"
            name="label"
            value="other"
            size="sm"
            variant="outline"
          >
            Keep ambiguous
          </Button>
        </div>
      </form>
    </div>
  );
}
