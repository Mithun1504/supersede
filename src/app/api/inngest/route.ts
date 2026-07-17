import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import {
  caseApproved,
  changePropagation,
  dueWorkDispatch,
  outboxPublisher,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    caseApproved,
    changePropagation,
    dueWorkDispatch,
    outboxPublisher,
  ],
});
