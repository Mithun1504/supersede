"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import type { FormEvent } from "react";
import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  GitBranch,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  ScrollText,
  Search,
  SearchCheck,
  Sparkles,
  Target,
} from "lucide-react";

import { RealtimeRefresh } from "@/components/product/realtime-refresh";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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

const productNav = [
  {
    key: "overview",
    label: "Overview",
    href: "/app",
    icon: Sparkles,
    tone: "cyan",
  },
  {
    key: "review",
    label: "Claim review",
    href: "/app/review",
    icon: SearchCheck,
    tone: "violet",
  },
  {
    key: "graph",
    label: "Dependency graph",
    href: "/app/graph",
    icon: GitBranch,
    tone: "pink",
  },
  {
    key: "changes",
    label: "Change events",
    href: "/app/changes",
    icon: AlertTriangle,
    tone: "amber",
  },
  {
    key: "blast-radius",
    label: "Blast radius",
    href: "/app/blast-radius",
    icon: Target,
    tone: "orange",
  },
  {
    key: "cases",
    label: "Divergence cases",
    href: "/app/cases",
    icon: ClipboardCheck,
    tone: "green",
  },
  {
    key: "probes",
    label: "Probes",
    href: "/app/probes",
    icon: Radio,
    tone: "cyan",
  },
  {
    key: "audit",
    label: "Audit",
    href: "/app/audit",
    icon: ScrollText,
    tone: "violet",
  },
  {
    key: "walkthrough",
    label: "Walkthrough",
    href: "/app/walkthrough",
    icon: Network,
    tone: "pink",
  },
] satisfies Array<{
  key: ProductNavKey;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "cyan" | "violet" | "pink" | "amber" | "orange" | "green";
}>;

const navTone = {
  cyan: "var(--signal-cyan)",
  violet: "var(--signal-violet)",
  pink: "var(--signal-pink)",
  amber: "var(--warning)",
  orange: "var(--destructive)",
  green: "var(--success)",
} as const;

const mobilePrimary = new Set<ProductNavKey>(["overview", "review", "graph"]);
export type ProductViewer = {
  displayName: string;
  organizationReady: boolean;
  authenticated: boolean;
};

export type ProductShellWorkspace = {
  organizationName: string;
  configuration: "propagate" | "displace";
  changeReference: string;
  reviewCount: number;
};

export function ProductShell({
  active,
  eyebrow,
  title,
  description,
  action,
  viewer,
  viewerAction,
  workspace,
  children,
}: {
  active: ProductNavKey;
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  viewer?: ProductViewer | null;
  viewerAction?: React.ReactNode;
  workspace: ProductShellWorkspace;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const resolvedActive =
    productNav.find((item) =>
      item.href === "/app"
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.key ?? active;

  function toggleCollapsed() {
    setCollapsed((current) => !current);
  }

  function handleWorkspaceSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new FormData(event.currentTarget)
      .get("workspace-search")
      ?.toString()
      .trim()
      .toLocaleLowerCase();

    if (!query) return;

    const destination = productNav.find(({ label, key }) =>
      `${label} ${key}`.toLocaleLowerCase().includes(query),
    );

    if (destination) router.push(destination.href);
  }

  return (
    <TooltipProvider>
      <div className="text-foreground min-h-dvh bg-transparent">
        <RealtimeRefresh />
        <a
          href="#content"
          className="bg-card text-foreground focus-visible:ring-ring fixed top-2 left-2 z-[70] -translate-y-20 rounded-lg px-4 py-2 text-sm shadow-xl focus-visible:translate-y-0 focus-visible:ring-3"
        >
          Skip to content
        </a>

        <div
          className={cn(
            "md:grid md:min-h-dvh md:transition-[grid-template-columns] md:duration-200",
            collapsed
              ? "md:grid-cols-[76px_minmax(0,1fr)]"
              : "md:grid-cols-[248px_minmax(0,1fr)]",
          )}
        >
          <aside className="signal-sidebar bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 hidden h-dvh border-r md:flex md:flex-col">
            <SidebarNav
              active={resolvedActive}
              collapsed={collapsed}
              onToggle={toggleCollapsed}
              viewer={viewer}
              viewerAction={viewerAction}
              workspace={workspace}
            />
          </aside>

          <div className="min-w-0 pb-20 md:pb-0">
            <header className="signal-header border-border/70 bg-background/88 supports-[backdrop-filter]:bg-background/82 sticky top-0 z-40 border-b backdrop-blur-xl">
              <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
                <MobileMenu
                  active={resolvedActive}
                  viewer={viewer}
                  workspace={workspace}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{eyebrow}</span>
                    <span className="text-muted-foreground hidden sm:inline">
                      /
                    </span>
                    <span className="text-chart-2 hidden truncate font-mono text-xs sm:inline">
                      {workspace.changeReference} active
                    </span>
                  </div>
                  <p className="text-muted-foreground truncate text-xs md:hidden">
                    {workspace.organizationName}
                  </p>
                </div>

                <form
                  role="search"
                  onSubmit={handleWorkspaceSearch}
                  className="border-border bg-card/70 focus-within:border-primary/50 focus-within:ring-primary/15 hidden h-9 max-w-md min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 transition-shadow focus-within:ring-3 lg:flex"
                >
                  <Search
                    className="text-muted-foreground size-4"
                    aria-hidden="true"
                  />
                  <label htmlFor="workspace-search" className="sr-only">
                    Jump to a workspace section
                  </label>
                  <input
                    id="workspace-search"
                    name="workspace-search"
                    type="search"
                    list="workspace-sections"
                    placeholder="Jump to a workspace section…"
                    className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <datalist id="workspace-sections">
                    {productNav.map((item) => (
                      <option key={item.key} value={item.label} />
                    ))}
                  </datalist>
                </form>

                <ThemeToggle />
                <span className="signal-chip hidden sm:inline-flex">
                  {workspace.configuration === "displace"
                    ? "Displace"
                    : "Propagate"}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="from-primary to-chart-2 text-primary-foreground focus-visible:ring-ring grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-gradient-to-br text-[11px] font-bold shadow-sm transition-transform hover:scale-105 focus-visible:ring-3">
                      {initialsFor(viewer?.displayName ?? "Read only")}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-card border-border text-foreground w-56 shadow-2xl"
                  >
                    <DropdownMenuLabel className="text-foreground font-semibold">
                      Account info
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="flex flex-col items-start gap-1 p-2">
                      <span className="text-muted-foreground text-xs">
                        User
                      </span>
                      <span className="text-sm font-medium">
                        {viewer?.displayName ?? "Public Walkthrough"}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="flex flex-col items-start gap-1 p-2">
                      <span className="text-muted-foreground text-xs">
                        Organization
                      </span>
                      <span className="text-sm font-medium">
                        {workspace.organizationName}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {viewer?.authenticated ? (
                      <DropdownMenuItem className="focus:bg-destructive/10 p-0">
                        <div className="w-full px-2 py-1.5">{viewerAction}</div>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem className="p-2" asChild>
                        <Link
                          href="/sign-in?returnTo=/app"
                          className="w-full text-sm font-medium"
                        >
                          Sign in with WorkOS
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <main
              id="content"
              tabIndex={-1}
              className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:gap-6 lg:px-8"
            >
              <div className="page-hero flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div className="max-w-3xl space-y-2">
                  <p className="eyebrow">{workspace.organizationName}</p>
                  <h1 className="gradient-text text-3xl font-semibold text-balance sm:text-4xl lg:text-[2.5rem]">
                    {title}
                  </h1>
                  {description ? (
                    <p className="text-muted-foreground max-w-2xl text-sm leading-6 sm:text-base">
                      {description}
                    </p>
                  ) : null}
                </div>
                <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
                  <span className="signal-chip">
                    {workspace.changeReference}
                  </span>
                  {action}
                </div>
              </div>
              {children}
            </main>
          </div>
        </div>

        <MobileBottomNav active={resolvedActive} />
      </div>
    </TooltipProvider>
  );
}

function SidebarNav({
  active,
  collapsed,
  onToggle,
  viewer,
  viewerAction,
  workspace,
}: {
  active: ProductNavKey;
  collapsed: boolean;
  onToggle: () => void;
  viewer: ProductViewer | null | undefined;
  viewerAction: React.ReactNode;
  workspace: ProductShellWorkspace;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-3.5">
      <div className="flex h-12 items-center justify-between gap-2">
        <Link
          href="/"
          className="focus-visible:ring-sidebar-ring flex min-w-0 items-center gap-2 rounded-lg p-2 focus-visible:ring-3"
        >
          <span className="signal-pulse bg-primary text-primary-foreground font-heading relative grid size-9 shrink-0 place-items-center rounded-lg font-bold">
            <Sparkles className="size-4" />
          </span>
          <span
            className={cn(
              "font-heading truncate text-xl font-bold tracking-tight transition-opacity",
              collapsed && "sr-only",
            )}
          >
            Supersede
          </span>
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>

      <div
        className={cn(
          "border-sidebar-border mt-4 rounded-xl border bg-white/4 p-3",
          collapsed && "p-2",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-sidebar-primary grid size-9 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/5">
            <Building2 className="size-4" />
          </span>
          <div className={cn("min-w-0", collapsed && "sr-only")}>
            <p className="truncate text-sm font-semibold">
              {workspace.organizationName}
            </p>
            <p className="text-sidebar-foreground/55 truncate text-xs">
              {workspace.configuration === "displace"
                ? "Displace"
                : "Propagate"}{" "}
              config
            </p>
          </div>
        </div>
      </div>

      <nav
        className="scrollbar-subtle mt-5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto"
        aria-label="Product sections"
      >
        {productNav.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={active}
            collapsed={collapsed}
            count={item.key === "review" ? workspace.reviewCount : undefined}
          />
        ))}
      </nav>

      <div className="border-sidebar-border mt-3 border-t pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hover:border-sidebar-border focus-visible:ring-sidebar-ring flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-all duration-200 outline-none hover:bg-white/5 focus-visible:ring-3">
              <span className="bg-sidebar-accent text-sidebar-accent-foreground grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold">
                {initialsFor(viewer?.displayName ?? "Read only")}
              </span>
              <div className={cn("min-w-0 flex-1", collapsed && "sr-only")}>
                <p className="truncate text-sm font-semibold">
                  {viewer?.displayName ?? "Public walkthrough"}
                </p>
                <p className="text-sidebar-foreground/55 truncate text-xs">
                  {viewer?.authenticated
                    ? "Governed workspace"
                    : "Read-only walkthrough"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={collapsed ? "right" : "top"}
            align="end"
            className="bg-sidebar border-sidebar-border text-sidebar-foreground w-56 shadow-2xl"
          >
            <DropdownMenuLabel className="text-sidebar-foreground font-semibold">
              Account info
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sidebar-border" />
            <DropdownMenuItem className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground flex flex-col items-start gap-1 p-2">
              <span className="text-sidebar-foreground/60 text-xs">
                Display Name
              </span>
              <span className="text-sm font-medium">
                {viewer?.displayName ?? "Public Walkthrough"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className="focus:bg-sidebar-accent focus:text-sidebar-accent-foreground flex flex-col items-start gap-1 p-2">
              <span className="text-sidebar-foreground/60 text-xs">
                Tenant Org
              </span>
              <span className="text-sm font-medium">
                {workspace.organizationName}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-sidebar-border" />
            {viewer?.authenticated ? (
              <DropdownMenuItem className="focus:bg-destructive/20 focus:text-destructive p-0">
                <div className="w-full px-2 py-1.5">{viewerAction}</div>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="p-2" asChild>
                <Link
                  href="/sign-in?returnTo=/app"
                  className="text-sidebar-foreground hover:text-sidebar-accent-foreground w-full text-sm font-medium"
                >
                  Sign in with WorkOS
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  collapsed = false,
  count,
}: {
  item: (typeof productNav)[number];
  active: ProductNavKey;
  collapsed?: boolean;
  count?: number | undefined;
}) {
  const Icon = item.icon;
  const isActive = item.key === active;
  const link = (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group focus-visible:ring-sidebar-ring relative flex min-h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-[0.8125rem] font-medium transition-all duration-200 focus-visible:ring-3",
        collapsed && "justify-center px-2",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)]"
          : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-white/5",
      )}
      style={{ "--nav-accent": navTone[item.tone] } as React.CSSProperties}
    >
      <Icon
        className={cn("size-4 shrink-0", isActive && "text-sidebar-primary")}
        aria-hidden="true"
      />
      <span className={cn("truncate", collapsed && "sr-only")}>
        {item.label}
      </span>
      {count ? (
        <span
          className={cn(
            "bg-warning/20 text-warning ml-auto rounded-full px-2 py-0.5 text-[10px]",
            collapsed && "absolute -top-1 -right-1 px-1.5",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  ) : (
    link
  );
}

function MobileMenu({
  active,
  viewer,
  workspace,
}: {
  active: ProductNavKey;
  viewer: ProductViewer | null | undefined;
  workspace: ProductShellWorkspace;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="signal-sidebar bg-sidebar text-sidebar-foreground border-sidebar-border w-[min(88vw,320px)] p-0"
      >
        <SheetHeader className="border-sidebar-border border-b p-5 text-left">
          <SheetTitle className="text-sidebar-foreground">Supersede</SheetTitle>
          <SheetDescription className="text-sidebar-foreground/60">
            {workspace.organizationName} · {workspace.changeReference}
          </SheetDescription>
        </SheetHeader>
        <nav
          className="flex flex-col gap-1 p-3"
          aria-label="Mobile product sections"
        >
          {productNav.map((item) => (
            <NavLink
              key={item.key}
              item={item}
              active={active}
              count={item.key === "review" ? workspace.reviewCount : undefined}
            />
          ))}
        </nav>
        <div className="border-sidebar-border mt-auto border-t p-5 text-sm">
          {viewer?.displayName ?? "Public walkthrough"}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileBottomNav({ active }: { active: ProductNavKey }) {
  const primary = productNav.filter((item) => mobilePrimary.has(item.key));
  return (
    <nav
      className="border-border/80 bg-background/94 fixed inset-x-0 bottom-0 z-40 grid h-[calc(4.25rem+env(safe-area-inset-bottom))] grid-cols-4 border-t px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(15,23,42,0.05)] backdrop-blur-xl md:hidden"
      aria-label="Primary mobile navigation"
    >
      {primary.map((item) => {
        const Icon = item.icon;
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium",
              selected
                ? "text-primary"
                : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            <Icon className="size-4" />
            <span>
              {item.key === "review"
                ? "Review"
                : item.key === "graph"
                  ? "Graph"
                  : item.label}
            </span>
          </Link>
        );
      })}
      <Sheet>
        <SheetTrigger asChild>
          <button
            className="text-muted-foreground flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium"
            aria-label="More sections"
          >
            <Menu className="size-4" />
            <span>More</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[78dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>All sections</SheetTitle>
            <SheetDescription>
              Continue through the governed workflow.
            </SheetDescription>
          </SheetHeader>
          <nav className="grid gap-2 overflow-y-auto px-4 pb-6 sm:grid-cols-2">
            {productNav
              .filter((item) => !mobilePrimary.has(item.key))
              .map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="border-border bg-card flex min-h-12 items-center gap-3 rounded-xl border px-4 text-sm font-medium"
                  >
                    <Icon className="text-primary size-4" />
                    {item.label}
                  </Link>
                );
              })}
          </nav>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function initialsFor(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Surface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn("app-surface", className)}>{children}</section>;
}

export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-border/70 relative flex flex-col gap-3 overflow-hidden border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <span className="bg-primary absolute inset-y-4 left-0 w-0.5 rounded-r-full" />
      <div className="space-y-1 pl-1">
        <h2 className="font-heading text-base font-bold sm:text-lg">{title}</h2>
        {detail ? (
          <p className="text-muted-foreground text-sm leading-6">{detail}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
