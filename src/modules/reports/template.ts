import type { ObservableMetrics } from "@/modules/reports/repository";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );

export function renderAuditReportHtml(input: {
  organizationName: string;
  sourceTitle: string;
  summary: string;
  oldRule: string;
  newRule: string;
  cutoff: Date;
  changeEventVersionId: string;
  metrics: ObservableMetrics;
}): string {
  const rows = [
    ["Impacted artifacts", input.metrics.affectedArtifacts],
    ["Verified artifact updates", input.metrics.artifactsVerified],
    ["People assigned", input.metrics.peopleAssigned],
    ["People assessed", input.metrics.peopleAssessed],
    ["People with passed correction work", input.metrics.peopleRemediated],
    ["Rechecks due", input.metrics.rechecksDue],
    ["Distinct-case rechecks assessed new-rule", input.metrics.rechecksClean],
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Supersede change evidence report</title>
<style>
@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#18231f;font-size:12px;line-height:1.5}h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px}.muted{color:#5b6963}.rule{border:1px solid #d9e0dc;border-radius:8px;padding:12px;margin:8px 0}.new{border-left:4px solid #167755}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #d9e0dc;padding:8px}th{background:#f3f6f4}.footer{margin-top:28px;font-size:10px;color:#5b6963}</style></head><body>
<h1>Change evidence report</h1><p class="muted">${escapeHtml(input.organizationName)} · ${escapeHtml(input.sourceTitle)}</p>
<p>${escapeHtml(input.summary)}</p>
<h2>Governed rule versions</h2><div class="rule"><strong>Previous rule</strong><p>${escapeHtml(input.oldRule)}</p></div>
<div class="rule new"><strong>Updated rule</strong><p>${escapeHtml(input.newRule)}</p></div>
<h2>Observable outcomes at cutoff</h2><table><thead><tr><th>Measure</th><th>Count</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join("")}</tbody></table>
<p class="footer">Cutoff: ${input.cutoff.toISOString()} · ChangeEvent version: ${escapeHtml(input.changeEventVersionId)} · Definitions: assigned means an assignment record; assessed means a valid submitted response with a current assessment; remediated means passed correction work; recheck-clean means a due, distinct-case recheck with current label new. Delivery or open events are not substituted for these measures.</p>
</body></html>`;
}
