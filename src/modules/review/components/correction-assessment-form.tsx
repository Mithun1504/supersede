import { Button } from "@/components/ui/button";
import { assessCorrectionAction } from "@/modules/review/actions";

export function CorrectionAssessmentForm({
  reviewTaskId,
  submission,
}: {
  reviewTaskId: string;
  submission: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium">Decrypted learner submission</p>
        <pre className="bg-muted max-h-80 overflow-auto rounded-xl p-4 text-xs whitespace-pre-wrap">
          {submission}
        </pre>
      </div>
      <form action={assessCorrectionAction} className="space-y-3">
        <input type="hidden" name="reviewTaskId" value={reviewTaskId} />
        <label className="block text-xs font-medium">
          Source-cited feedback
          <textarea
            name="feedback"
            required
            minLength={10}
            maxLength={4000}
            className="border-input bg-background mt-1 min-h-20 w-full rounded-lg border p-3 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" name="outcome" value="passed" size="sm">
            Pass and schedule rechecks
          </Button>
          <Button
            type="submit"
            name="outcome"
            value="failed"
            size="sm"
            variant="destructive"
          >
            Return for revision
          </Button>
        </div>
      </form>
    </div>
  );
}
