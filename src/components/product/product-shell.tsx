"use client";

import { usePathname } from "next/navigation";
import type React from "react";
import { useState } from "react";

import {
  MobileBottomNav,
  MobileWorkflowMenu,
} from "@/components/product/product-mobile-navigation";
import {
  formatWorkflowStep,
  resolveProductNav,
  utilityNav,
  type ProductNavItem,
  type ProductNavKey,
} from "@/components/product/product-navigation";
import { ProductSidebar } from "@/components/product/product-sidebar";
import type {
  ProductShellWorkspace,
  ProductViewer,
} from "@/components/product/product-shell-types";
import { RealtimeRefresh } from "@/components/product/realtime-refresh";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type { ProductNavKey } from "@/components/product/product-navigation";
export type {
  ProductShellWorkspace,
  ProductViewer,
} from "@/components/product/product-shell-types";

export function ProductShell({
  active,
  title,
  description,
  action,
  viewer,
  viewerAction,
  workspace,
  children,
}: {
  active: ProductNavKey;
  eyebrow?: string;
  title: string;
  description?: string | undefined;
  action?: React.ReactNode;
  viewer?: ProductViewer | null | undefined;
  viewerAction?: React.ReactNode;
  workspace: ProductShellWorkspace;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const current = resolveProductNav(usePathname(), active);

  return (
    <TooltipProvider>
      <div className="text-foreground min-h-dvh">
        <a
          href="#content"
          className="bg-foreground text-background focus-visible:ring-ring fixed top-2 left-2 z-[70] -translate-y-20 rounded-md px-4 py-2 text-sm font-bold focus-visible:translate-y-0 focus-visible:ring-3"
        >
          Skip to content
        </a>

        <div
          className={cn(
            "md:grid md:min-h-dvh md:transition-[grid-template-columns] md:duration-200 md:[transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
            collapsed
              ? "md:grid-cols-[72px_minmax(0,1fr)]"
              : "md:grid-cols-[272px_minmax(0,1fr)]",
          )}
        >
          <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 hidden h-dvh border-r md:flex md:flex-col">
            <ProductSidebar
              active={current.key}
              collapsed={collapsed}
              onToggle={() => setCollapsed((value) => !value)}
              viewer={viewer}
              viewerAction={viewerAction}
              workspace={workspace}
            />
          </aside>

          <div className="min-w-0 pb-20 md:pb-0">
            <ProductTopbar
              current={current}
              viewer={viewer}
              viewerAction={viewerAction}
              workspace={workspace}
            />
            <main
              id="content"
              tabIndex={-1}
              className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 py-5 sm:px-6 sm:py-7 lg:gap-8 lg:px-10 lg:py-8"
            >
              <PageHeading
                current={current}
                title={title}
                description={description}
                action={action}
              />
              {children}
            </main>
          </div>
        </div>

        <MobileBottomNav active={current.key} />
      </div>
    </TooltipProvider>
  );
}

function ProductTopbar({
  current,
  viewer,
  viewerAction,
  workspace,
}: {
  current: ProductNavItem;
  viewer: ProductViewer | null | undefined;
  viewerAction: React.ReactNode;
  workspace: ProductShellWorkspace;
}) {
  return (
    <header className="border-border bg-background sticky top-0 z-40 border-b">
      <div className="flex min-h-14 items-center gap-3 px-4 sm:px-6 lg:px-10">
        <MobileWorkflowMenu
          active={current.key}
          viewer={viewer}
          viewerAction={viewerAction}
          workspace={workspace}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {workspace.changeReference}
            <span className="text-muted-foreground"> / {current.label}</span>
          </p>
          <p className="text-muted-foreground truncate text-xs md:hidden">
            {workspace.organizationName}
          </p>
        </div>
        <span className="text-muted-foreground hidden text-xs sm:inline">
          {viewer?.authenticated ? "Governed workspace" : "Public, read-only"}
        </span>
        <RealtimeRefresh authenticated={viewer?.authenticated ?? false} />
        <ThemeToggle />
      </div>
    </header>
  );
}

function PageHeading({
  current,
  title,
  description,
  action,
}: {
  current: ProductNavItem;
  title: string;
  description?: string | undefined;
  action?: React.ReactNode;
}) {
  return (
    <header className="border-border grid gap-5 border-b pb-6 sm:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[84px_minmax(0,1fr)_auto] lg:items-end">
      <div className="font-heading text-primary flex items-baseline gap-1 sm:block">
        <span className="text-3xl leading-none font-semibold tabular-nums">
          {current.key === utilityNav.key
            ? "G"
            : formatWorkflowStep(current.step)}
        </span>
        <span className="text-muted-foreground text-xs sm:mt-1 sm:block">
          {current.key === utilityNav.key ? "guide" : "/ 07"}
        </span>
      </div>
      <div className="max-w-3xl min-w-0">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mt-2 max-w-[70ch] text-sm leading-6 sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-wrap items-center gap-2 sm:col-start-2 lg:col-start-auto">
          {action}
        </div>
      ) : null}
    </header>
  );
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
    <div className="border-border flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-semibold tracking-[-0.015em]">
          {title}
        </h2>
        {detail ? (
          <p className="text-muted-foreground mt-1 max-w-[68ch] text-sm leading-6">
            {detail}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
