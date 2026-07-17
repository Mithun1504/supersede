import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import {
  changePropagation,
  dueWorkDispatch,
  recheckSchedule,
  reportGeneration,
  outboxPublisher,
  emailDelivery,
  slackDelivery,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    changePropagation,
    dueWorkDispatch,
    recheckSchedule,
    reportGeneration,
    outboxPublisher,
    emailDelivery,
    slackDelivery,
  ],
});
