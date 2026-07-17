import Link from "next/link";
import type React from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  GitBranch,
  Network,
  Radio,
  ScrollText,
  SearchCheck,
  Sparkles,
  Target,
} from "lucide-react";

import { productNav, type ProductNavKey } from "@/components/product/demo-data";
import { cn } from "@/lib/utils";

const icons = {
  overview: Sparkles,
  review: SearchCheck,
  graph: GitBranch,
  changes: AlertTriangle,
  "blast-radius": Target,
  cases: ClipboardCheck,
  probes: Radio,
  audit: ScrollText,
  walkthrough: Network,
} satisfies Record<ProductNavKey, React.ComponentType<{ className?: string }>>;

export type ProductViewer = {
  displayName: string;
  organizationReady: boolean;
};

export function ProductShell({
  active,
  eyebrow,
  title,
  description,
  action,
  viewer,
  viewerAction,
  children,
}: {
  active: ProductNavKey;
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  viewer?: ProductViewer | null;
  viewerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <a
        href="#content"
        className="bg-card text-foreground focus-visible:ring-ring fixed top-2 left-2 z-50 -translate-y-16 rounded-lg px-4 py-2 text-sm shadow-sm focus-visible:translate-y-0 focus-visible:ring-3"
      >
        Skip to content
      </a>
      <div className="md:grid md:min-h-dvh md:grid-cols-[244px_1fr]">
        <aside className="border-border bg-sidebar hidden min-h-dvh border-r md:flex md:flex-col">
          <SidebarNav
            active={active}
            viewer={viewer}
            viewerAction={viewerAction}
          />
        </aside>
        <div className="min-w-0">
          <header className="border-border bg-background/95 sticky top-0 z-30 border-b backdrop-blur">
            <div className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{eyebrow}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    St. Marlowe Health · CE-2026-0714-001 active
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-3 py-1 text-xs font-medium">
                    Displace
                  </span>
                </div>
              </div>
              <nav
                className="flex gap-2 overflow-x-auto pb-1 md:hidden"
                aria-label="Mobile product sections"
                tabIndex={0}
              >
                {productNav.map((item) => (
                  <NavLink key={item.key} item={item} active={active} compact />
                ))}
              </nav>
            </div>
          </header>
          <main
            id="content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8"
          >
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div className="max-w-3xl space-y-2">
                <h1 className="text-3xl font-semibold text-balance sm:text-4xl">
                  {title}
                </h1>
                {description ? (
                  <p className="text-muted-foreground max-w-2xl text-sm leading-6 sm:text-base">
                    {description}
                  </p>
                ) : null}
              </div>
              {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarNav({
  active,
  viewer,
  viewerAction,
}: {
  active: ProductNavKey;
  viewer: ProductViewer | null | undefined;
  viewerAction: React.ReactNode;
}) {
  const initials = viewer
    ? viewer.displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : "RO";

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <Link
        href="/"
        className="focus-visible:ring-ring rounded-lg p-2 focus-visible:ring-3"
      >
        <span className="font-heading text-3xl font-semibold">Supersede</span>
      </Link>
      <div className="border-border bg-card mt-4 rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-md text-xs font-semibold">
            SM
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">St. Marlowe Health</p>
            <p className="text-muted-foreground truncate text-xs">
              Displace config · hospital
            </p>
          </div>
        </div>
      </div>
      <nav className="mt-6 flex flex-col gap-1" aria-label="Product sections">
        {productNav.map((item) => (
          <NavLink key={item.key} item={item} active={active} />
        ))}
      </nav>
      <div className="border-border mt-auto border-t pt-4">
        <div className="flex items-center gap-3 px-2">
          <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-full text-xs font-semibold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {viewer?.displayName ?? "Public seeded view"}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {viewer
                ? viewer.organizationReady
                  ? "Signed in with WorkOS"
                  : "Signed in · organization pending"
                : "Read-only walkthrough"}
            </p>
          </div>
          {viewerAction}
        </div>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  compact = false,
}: {
  item: (typeof productNav)[number];
  active: ProductNavKey;
  compact?: boolean;
}) {
  const Icon = icons[item.key];
  const isActive = item.key === active;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring inline-flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:ring-3",
        compact ? "h-10 shrink-0 px-3" : "h-10 px-3",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-card hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
      {item.count ? (
        <span className="bg-warning/20 text-warning-foreground ml-auto rounded-full px-2 py-0.5 text-xs">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

export function Surface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("border-border bg-card rounded-lg border", className)}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="border-border flex flex-col gap-1 border-b px-4 py-4 sm:px-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {detail ? (
        <p className="text-muted-foreground text-sm leading-6">{detail}</p>
      ) : null}
    </div>
  );
}
