import type { Metadata } from "next";

import { auditRows } from "@/components/product/demo-data";
import { SectionTitle, Surface } from "@/components/product/product-shell";
import { AuthenticatedProductShell } from "@/components/product/product-shell-auth";
import { StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Audit",
};

export default function AuditPage() {
  return (
    <AuthenticatedProductShell
      active="audit"
      eyebrow="Audit"
      title="Audit"
      description='Observable terms, append-only records, verifiable export. "Regulator-grade" appears nowhere unless this workflow backs it.'
      action={
        <Button asChild variant="outline">
          <a
            href="/api/v1/public/walkthrough/audit-export"
            download
            data-product-action="export-audit-bundle"
          >
            Download checksummed bundle
          </a>
        </Button>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Assigned", "12", "100%"],
          ["Assessed", "12", "100% · 3 answered old-rule"],
          ["Remediated", "3", "3 of 3 old-rule responses"],
          ["Rechecked", "1", "2 scheduled · different case"],
        ].map(([label, value, detail]) => (
          <Surface className="p-4" key={label}>
            <p className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
              {label}
            </p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
            <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
          </Surface>
        ))}
      </section>

      <Surface>
        <SectionTitle
          title="Append-only log"
          detail="The UI states process completion and assessed responses; it does not certify what people believe."
        />
        <div
          className="overflow-x-auto"
          tabIndex={0}
          aria-label="Append-only audit table"
        >
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-muted-foreground border-border border-b text-xs tracking-[0.12em] uppercase">
              <tr>
                <th className="px-4 py-3 sm:px-6">Timestamp (ET)</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Object</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map(([time, actor, action, object]) => (
                <tr
                  className="border-border border-b last:border-0"
                  key={`${time}-${action}`}
                >
                  <td className="px-4 py-4 font-mono sm:px-6">{time}</td>
                  <td className="px-4 py-4">{actor}</td>
                  <td className="px-4 py-4">{action}</td>
                  <td className="px-4 py-4 font-mono text-xs">{object}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-border flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-muted-foreground text-xs leading-5">
            PDF + evidence JSON + event and approval CSVs · per-file SHA-256
            values in manifest.json
          </p>
          <StatusPill tone="warning">Standard retention · not WORM</StatusPill>
        </div>
      </Surface>
    </AuthenticatedProductShell>
  );
}
