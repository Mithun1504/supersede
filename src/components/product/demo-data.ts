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

export const productNav = [
  { key: "overview", label: "Overview", href: "/app" },
  { key: "review", label: "Claim review", href: "/app/review", count: 38 },
  { key: "graph", label: "Dependency graph", href: "/app/graph" },
  { key: "changes", label: "Change events", href: "/app/changes" },
  { key: "blast-radius", label: "Blast radius", href: "/app/blast-radius" },
  { key: "cases", label: "Divergence cases", href: "/app/cases" },
  { key: "probes", label: "Probes", href: "/app/probes" },
  { key: "audit", label: "Audit", href: "/app/audit" },
  { key: "walkthrough", label: "Walkthrough", href: "/app/walkthrough" },
] satisfies Array<{
  key: ProductNavKey;
  label: string;
  href: string;
  count?: number;
}>;

export const changeEvent = {
  id: "CE-2026-0714-001",
  tenant: "St. Marlowe Health",
  configuration: "Displace config · hospital",
  reviewer: "Dr. A. Patel",
  validator: "Dr. J. Morgan",
  status: "Validated - propagation complete",
  versionLock: "v3.1 locked 07/14 11:03 ET",
  date: "July 15, 2026",
  title: "High-dose IV PPI timing clarification for NVUGIB",
  oldRule:
    "High-dose IV PPI as soon as possible before or after endoscopy for NVUGIB with high-risk stigmata.",
  newRule:
    "High-dose IV PPI as soon as possible after endoscopy for NVUGIB with high-risk stigmata.",
  citation:
    "For patients with nonvariceal upper gastrointestinal bleeding, we suggest high-dose intravenous proton pump inhibitor therapy as soon as possible after endoscopy for those with high-risk stigmata.",
};

export const metrics = [
  { label: "Rewrite required", value: "2", detail: "High impact" },
  { label: "Peripheral edits", value: "3", detail: "Moderate impact" },
  { label: "Exposed roles", value: "6 of 8", detail: "Potential exposure" },
  { label: "Uncertain links", value: "22%", detail: "Need review" },
];

export const affectedArtifacts = [
  {
    name: "GI Bleed Management Protocol",
    version: "v5.4",
    type: "Protocol",
    impact: "Rewrite required",
    confidence: 72,
    owner: "Gastroenterology",
    exposure: "6 of 8",
  },
  {
    name: "Order Set: Upper GI Bleed (Adult)",
    version: "v4.1",
    type: "Order set",
    impact: "Rewrite required",
    confidence: 68,
    owner: "ED Physician · Nurse ED",
    exposure: "6 of 8",
  },
  {
    name: "ED Provider Job Aid",
    version: "v2.2",
    type: "Job aid",
    impact: "Peripheral edits",
    confidence: 55,
    owner: "ED Physician · APP",
    exposure: "4 of 8",
  },
  {
    name: "Pharmacy P&T Monograph: PPIs",
    version: "v1.7",
    type: "Reference",
    impact: "Peripheral edits",
    confidence: 55,
    owner: "Pharmacist · Resident",
    exposure: "3 of 8",
  },
  {
    name: "Nursing Quick Reference: GI Bleed",
    version: "v3.3",
    type: "Reference",
    impact: "Roles exposed only",
    confidence: 31,
    owner: "Nursing",
    exposure: "2 of 8",
  },
];

export const reviewItems = [
  {
    claim: "High-dose IV PPI timing clarification for NVUGIB",
    source: "ACG Clinical Guideline v3.1 · pages 24-25",
    confidence: 68,
    status: "Needs edge review",
  },
  {
    claim: "Pre-endoscopy PPI bolus required for all UGIB",
    source: "ED Order Set v4.1 · step 4",
    confidence: 54,
    status: "Conflicts with new rule",
  },
  {
    claim: "Transition to oral PPI within 72 hours if stable",
    source: "GI Bleed Management Protocol v5.5",
    confidence: 72,
    status: "Impacted",
  },
];

export const graphColumns = [
  {
    label: "Change source",
    nodes: ["High-dose IV PPI timing clarification for NVUGIB"],
  },
  {
    label: "Claims",
    nodes: [
      "C-77421 · after endoscopy for high-risk stigmata",
      "C-55122 · pre-endoscopy bolus required",
      "C-55890 · before or after endoscopy",
      "C-62011 · suspected variceal bleeding",
    ],
  },
  {
    label: "Protocols",
    nodes: [
      "GI Bleed Management Protocol",
      "Upper GI Bleed Adult Order Set",
      "ED Provider Job Aid",
      "PPI Dosing Reference",
    ],
  },
  {
    label: "Roles",
    nodes: [
      "Gastroenterologist · 48 people",
      "Hospitalist · 62 people",
      "Nurse ED · 134 people",
      "ED Physician · 110 people",
      "APP · 86 people",
    ],
  },
];

export const divergenceCases = [
  {
    id: "CASE-2026-0714-019",
    title: "Timing of high-dose IV PPI in NVUGIB",
    scenario:
      "A 64-year-old presents with hematemesis and melena. Endoscopy is scheduled within the hour; high-risk stigmata are suspected.",
    oldAnswer: "Start high-dose IV PPI now, before endoscopy.",
    newAnswer: "Do not start high-dose PPI until after endoscopy.",
    status: "Approved · version-locked",
  },
  {
    id: "CASE-2026-0714-022",
    title: "Post-endoscopy protocol selection",
    scenario:
      "Endoscopy confirms high-risk stigmata. The order set offers immediate oral PPI or high-dose IV PPI.",
    oldAnswer: "Either IV or oral protocol may be selected.",
    newAnswer: "Use high-dose IV PPI after endoscopy.",
    status: "Draft · expert review",
  },
];

export const probeSteps = [
  "Identify delta: old vs new timing rule",
  "Correct the order set artifact",
  "Expert review of the correction",
  "Recheck with a different approved case",
];

export const auditRows = [
  ["07/14 10:21", "Dr. A. Patel", "Submitted", "ChangeEvent CE-2026-0714-001"],
  ["07/14 11:03", "Dr. J. Morgan", "Second-review approved", "REV-7731"],
  ["07/14 11:15", "Dr. M. Reynolds", "Case approved & locked", "APP-5512"],
  ["07/14 11:58", "Dr. K. Osei", "Release authorized", "REL-2201"],
  ["07/14 12:02", "System", "Artifact published", "PUB-8890"],
  ["07/14 12:26", "System", "Probe delivered", "DEL-8F7C1A2D"],
];
