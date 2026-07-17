import { z } from "zod";

import { inngest } from "@/inngest/client";
import { releaseBlockedRechecksForApprovedCase } from "@/modules/learning";

export const caseApprovedPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  actorMembershipId: z.string().uuid(),
  caseVersionId: z.string().uuid(),
});

export const caseApproved = inngest.createFunction(
  {
    id: "release-blocked-rechecks-on-case-approval",
    name: "Release blocked rechecks when a different case is approved",
    triggers: { event: "case.approved" },
    retries: 5,
  },
  async ({ event, step }) => {
    const payload = caseApprovedPayloadSchema.parse(event.data);
    return step.run("release-blocked-rechecks", () =>
      releaseBlockedRechecksForApprovedCase(
        {
          organizationId: payload.organizationId,
          actorMembershipId: payload.actorMembershipId,
        },
        { approvedCaseVersionId: payload.caseVersionId },
      ),
    );
  },
);
