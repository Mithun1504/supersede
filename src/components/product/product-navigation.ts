export type ProductNavKey =
  | "overview"
  | "review"
  | "graph"
  | "changes"
  | "blast-radius"
  | "cases"
  | "probes"
  | "audit"
  | "walkthrough";

export type ProductNavItem = {
  key: ProductNavKey;
  label: string;
  shortLabel: string;
  href: string;
  step: number | null;
  purpose: string;
};

export const workflowNav = [
  {
    key: "overview",
    label: "Control room",
    shortLabel: "Control",
    href: "/app",
    step: null,
    purpose: "See what changed and what blocks closure.",
  },
  {
    key: "review",
    label: "Evidence intake",
    shortLabel: "Evidence",
    href: "/app/review",
    step: 1,
    purpose: "Extract claims and verify their source evidence.",
  },
  {
    key: "changes",
    label: "Source change",
    shortLabel: "Change",
    href: "/app/changes",
    step: 2,
    purpose: "Validate the rule delta before downstream propagation.",
  },
  {
    key: "graph",
    label: "Dependency map",
    shortLabel: "Map",
    href: "/app/graph",
    step: 3,
    purpose: "Review the validated path into downstream work.",
  },
  {
    key: "blast-radius",
    label: "Impact review",
    shortLabel: "Impact",
    href: "/app/blast-radius",
    step: 4,
    purpose: "Triage artifacts, owners, and potential exposure.",
  },
  {
    key: "cases",
    label: "Decision cases",
    shortLabel: "Cases",
    href: "/app/cases",
    step: 5,
    purpose: "Inspect where old and new rules diverge and what was approved.",
  },
  {
    key: "probes",
    label: "Remediation",
    shortLabel: "Remediate",
    href: "/app/probes",
    step: 6,
    purpose: "Track assessment, correction, and rechecks.",
  },
  {
    key: "audit",
    label: "Audit trail",
    shortLabel: "Audit",
    href: "/app/audit",
    step: 7,
    purpose: "Verify approvals, evidence, and export integrity.",
  },
] satisfies ProductNavItem[];

export const utilityNav = {
  key: "walkthrough",
  label: "Demo guide",
  shortLabel: "Guide",
  href: "/app/walkthrough",
  step: null,
  purpose: "Follow the public five-minute product path.",
} satisfies ProductNavItem;

export const productNav = [...workflowNav, utilityNav];

export function resolveProductNav(pathname: string, fallback: ProductNavKey) {
  return (
    productNav.find((item) =>
      item.href === "/app"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? productNav.find((item) => item.key === fallback)!
  );
}

export function formatWorkflowStep(step: number | null) {
  return step === null ? "00" : String(step).padStart(2, "0");
}
