import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import {
  caseApproved,
  changePropagation,
  documentIndexing,
  dueWorkDispatch,
  outboxPublisher,
  probeAssignmentWorkflow,
  probeGradingWorkflow,
  remediationWorkflow,
  reportGenerationWorkflow,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    caseApproved,
    changePropagation,
    documentIndexing,
    dueWorkDispatch,
    outboxPublisher,
    probeAssignmentWorkflow,
    probeGradingWorkflow,
    remediationWorkflow,
    reportGenerationWorkflow,
  ],
});
