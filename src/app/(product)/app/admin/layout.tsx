import Link from "next/link";

import { Separator } from "@/components/ui/separator";
import { requirePermission } from "@/modules/identity/policy";

const adminNavigation = [
  ["Organization", "/app/admin/organization"],
  ["Members & roles", "/app/admin/members"],
  ["Approval policies", "/app/admin/policies"],
  ["Retention & holds", "/app/admin/retention"],
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission("organization.read");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground text-sm">Administration</p>
        <h1 className="text-2xl font-semibold">Organization controls</h1>
      </div>
      <nav aria-label="Administration" className="flex gap-5 overflow-x-auto">
        {adminNavigation.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="hover:text-primary focus-visible:ring-ring shrink-0 rounded-sm text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {label}
          </Link>
        ))}
      </nav>
      <Separator />
      {children}
    </div>
  );
}
