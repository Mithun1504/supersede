import type { Metadata } from "next";
import Link from "next/link";

import { ProbeDashboard } from "@/components/product/probe-dashboard";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { Button } from "@/components/ui/button";
import { getProductWorkspace } from "@/modules/product";

export const metadata: Metadata = {
  title: "Remediation",
};

export default async function ProbesPage() {
  const data = await getProductWorkspace();
  const probes = data.probes;
  const learners = [
    ...new Map(probes.map((probe) => [probe.personId, probe])).values(),
  ];
  const summary = {
    assigned: probes.length,
    delivered: probes.filter(
      (probe) =>
        probe.deliveryStatus === "opened" ||
        probe.deliveryStatus === "completed",
    ).length,
    responded: probes.filter((probe) => probe.responseId).length,
    assessed: probes.filter((probe) => probe.gradingConfidence !== null).length,
    remediationAssigned: probes.filter((probe) => probe.remediationAssignmentId)
      .length,
    remediated: probes.filter((probe) => probe.remediationStatus === "passed")
      .length,
    recheckScheduled: learners.reduce(
      (sum, probe) => sum + probe.recheckScheduled,
      0,
    ),
    rechecked: learners.reduce((sum, probe) => sum + probe.recheckCompleted, 0),
  };

  return (
    <AuthenticatedProductShell
      active="probes"
      title="Remediation"
      description="Follow each governed assignment from delivery through assessment, corrective work, and a different-case recheck."
      action={
        <Button asChild>
          <Link href="/app/audit" data-product-action="view-audit">
            Open audit trail
          </Link>
        </Button>
      }
    >
      <ProbeDashboard
        probes={data.organization.individualResultsVisible ? data.probes : []}
        summary={summary}
        individualResultsVisible={data.organization.individualResultsVisible}
      />
    </AuthenticatedProductShell>
  );
}
