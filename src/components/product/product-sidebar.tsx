"use client";

import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { ProductMark } from "@/components/product/product-mark";
import {
  formatWorkflowStep,
  utilityNav,
  workflowNav,
  type ProductNavItem,
  type ProductNavKey,
} from "@/components/product/product-navigation";
import type {
  ProductShellWorkspace,
  ProductViewer,
} from "@/components/product/product-shell-types";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function ProductSidebar({
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
    <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
      <div className="flex h-11 items-center justify-between gap-2 px-1">
        <Link
          href="/"
          className="focus-visible:ring-sidebar-ring flex min-w-0 items-center gap-3 rounded-md px-2 py-1 focus-visible:ring-3"
          aria-label={collapsed ? "Supersede home" : undefined}
        >
          <ProductMark className="text-sidebar-primary shrink-0" />
          <span
            className={cn(
              "font-heading truncate text-xl font-semibold tracking-[-0.025em]",
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

      <div className={cn("mt-6 px-3", collapsed && "sr-only")}>
        <p className="truncate text-sm font-bold">
          {workspace.organizationName}
        </p>
        <p className="text-sidebar-foreground/78 mt-0.5 text-xs">
          {workspace.configuration === "displace" ? "Displace" : "Propagate"}
          {" workspace"}
        </p>
      </div>

      <nav
        className="scrollbar-subtle mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
        aria-label="Governed workflow"
      >
        <p
          className={cn(
            "text-sidebar-foreground/72 px-3 pb-2 text-[11px] font-bold",
            collapsed && "sr-only",
          )}
        >
          Workflow order
        </p>
        {workflowNav.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            active={active}
            collapsed={collapsed}
            count={item.key === "review" ? workspace.reviewCount : undefined}
          />
        ))}
      </nav>

      <div className="border-sidebar-border mt-4 border-t pt-3">
        <SidebarLink item={utilityNav} active={active} collapsed={collapsed} />
        <AccountMenu
          collapsed={collapsed}
          viewer={viewer}
          viewerAction={viewerAction}
          workspace={workspace}
        />
      </div>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  collapsed = false,
  count,
}: {
  item: ProductNavItem;
  active: ProductNavKey;
  collapsed?: boolean;
  count?: number | undefined;
}) {
  const isActive = item.key === active;
  const link = (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group focus-visible:ring-sidebar-ring flex min-h-11 min-w-0 items-center gap-3 rounded-md px-3 text-sm transition-[background-color,color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-3 active:scale-[0.985]",
        collapsed && "justify-center px-1",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
      )}
    >
      <span
        className={cn(
          "w-6 shrink-0 text-center text-xs tabular-nums",
          isActive ? "text-sidebar-primary" : "text-sidebar-foreground/72",
        )}
        aria-hidden="true"
      >
        {item.key === utilityNav.key ? "G" : formatWorkflowStep(item.step)}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>
        {item.label}
      </span>
      {typeof count === "number" && count > 0 ? (
        <span
          className={cn(
            "text-sidebar-foreground/75 text-xs font-bold tabular-nums",
            collapsed && "sr-only",
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
      <TooltipContent side="right">
        <p className="font-bold">{item.label}</p>
        <p className="text-muted-foreground max-w-56 text-xs">{item.purpose}</p>
      </TooltipContent>
    </Tooltip>
  ) : (
    link
  );
}

function AccountMenu({
  collapsed,
  viewer,
  viewerAction,
  workspace,
}: {
  collapsed: boolean;
  viewer: ProductViewer | null | undefined;
  viewerAction: React.ReactNode;
  workspace: ProductShellWorkspace;
}) {
  const displayName = viewer?.displayName ?? "Public walkthrough";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "hover:bg-sidebar-accent/55 focus-visible:ring-sidebar-ring mt-2 flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors duration-150 focus-visible:ring-3",
            collapsed && "justify-center px-1",
          )}
        >
          <span className="font-heading text-sidebar-primary w-6 shrink-0 text-center text-sm font-semibold">
            {initialsFor(displayName)}
          </span>
          <span className={cn("min-w-0", collapsed && "sr-only")}>
            <span className="block truncate font-bold">{displayName}</span>
            <span className="text-sidebar-foreground/75 block truncate text-xs">
              {viewer?.authenticated ? "Signed in" : "Read-only"}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align="end"
        className="w-64"
      >
        <DropdownMenuLabel>
          <span className="block font-bold">{displayName}</span>
          <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
            {workspace.organizationName}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {viewer?.authenticated ? (
          <DropdownMenuItem className="p-0">
            <div className="w-full px-2 py-1.5">{viewerAction}</div>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/sign-in?returnTo=/app">Sign in with WorkOS</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
