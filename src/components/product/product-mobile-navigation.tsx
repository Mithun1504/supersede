"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import type React from "react";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function MobileWorkflowMenu({
  active,
  viewer,
  viewerAction,
  workspace,
}: {
  active: ProductNavKey;
  viewer: ProductViewer | null | undefined;
  viewerAction: React.ReactNode;
  workspace: ProductShellWorkspace;
}) {
  const governed = Boolean(viewer?.authenticated && viewer.organizationReady);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open workflow navigation"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(92vw,360px)] p-0">
        <SheetHeader className="border-border border-b p-5 text-left">
          <SheetTitle className="flex items-center gap-3">
            <ProductMark className="text-primary" /> Supersede
          </SheetTitle>
          <SheetDescription>
            {workspace.organizationName} / {workspace.changeReference}
          </SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-3" aria-label="Workflow order">
          {workflowNav.map((item) => (
            <MobileMenuLink
              key={item.key}
              item={item}
              active={active}
              detailed
            />
          ))}
        </nav>
        <nav className="border-border border-t p-3" aria-label="Product guide">
          <MobileMenuLink item={utilityNav} active={active} detailed />
        </nav>
        <div className="border-border mt-auto border-t p-5 text-sm">
          <p className="font-bold">
            {viewer?.displayName ?? "Public walkthrough"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {governed ? "Governed workspace" : "Public, read-only"}
          </p>
          <div className="mt-3">
            {viewer?.authenticated ? (
              viewerAction
            ) : viewer?.authenticationAvailable ? (
              <Link
                href="/sign-in?returnTo=/app"
                className="text-primary focus-visible:ring-ring rounded-sm text-xs font-bold focus-visible:ring-3"
              >
                Sign in with WorkOS
              </Link>
            ) : (
              <p className="text-muted-foreground text-xs">
                Live sign-in unavailable
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MobileBottomNav({ active }: { active: ProductNavKey }) {
  const currentIndex = workflowNav.findIndex((item) => item.key === active);
  const current = currentIndex >= 0 ? workflowNav[currentIndex] : utilityNav;
  const previous = currentIndex > 0 ? workflowNav[currentIndex - 1] : undefined;
  const next =
    currentIndex >= 0 && currentIndex < workflowNav.length - 1
      ? workflowNav[currentIndex + 1]
      : undefined;

  return (
    <nav
      className="border-border bg-background fixed inset-x-0 bottom-0 z-40 grid h-[calc(4.25rem+env(safe-area-inset-bottom))] grid-cols-5 border-t px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary mobile navigation"
    >
      <MobileContextLink
        item={workflowNav[0]}
        label="Control"
        selected={active === "overview"}
      />
      <MobileContextLink item={previous} label="Previous" />
      <MobileContextLink item={current} label="Current" selected />
      <MobileContextLink item={next} label="Next" />
      <Sheet>
        <SheetTrigger asChild>
          <button
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-bold",
              active === utilityNav.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            <Menu className="size-4" />
            <span>More</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Complete workflow</SheetTitle>
            <SheetDescription>
              Follow the governed path in order. Navigation does not imply that
              a step is complete.
            </SheetDescription>
          </SheetHeader>
          <nav className="grid gap-1 overflow-y-auto px-4 pb-4 sm:grid-cols-2">
            {workflowNav.map((item) => (
              <MobileMenuLink key={item.key} item={item} active={active} />
            ))}
          </nav>
          <nav
            className="border-border border-t px-4 pt-3 pb-6"
            aria-label="Product guide"
          >
            <p className="data-label mb-1 px-3">Outside the workflow</p>
            <MobileMenuLink item={utilityNav} active={active} />
          </nav>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

function MobileMenuLink({
  item,
  active,
  detailed = false,
}: {
  item: ProductNavItem;
  active: ProductNavKey;
  detailed?: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={item.key === active ? "page" : undefined}
      className={cn(
        "grid grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-md px-3 text-sm",
        detailed ? "min-h-14" : "min-h-12 font-bold",
        item.key === active
          ? "bg-accent text-accent-foreground font-bold"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="text-primary text-xs tabular-nums">
        {item.key === utilityNav.key ? "G" : formatWorkflowStep(item.step)}
      </span>
      <span>
        <span className="block">{item.label}</span>
        {detailed ? (
          <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
            {item.purpose}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function MobileContextLink({
  item,
  label,
  selected = false,
}: {
  item: ProductNavItem | undefined;
  label: string;
  selected?: boolean;
}) {
  if (!item) {
    return <span aria-hidden="true" />;
  }

  return (
    <Link
      href={item.href}
      aria-current={selected ? "page" : undefined}
      aria-label={`${label}: ${item.label}`}
      className={cn(
        "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] font-bold",
        selected ? "bg-accent text-accent-foreground" : "text-muted-foreground",
      )}
    >
      <span className="tabular-nums">
        {item.key === utilityNav.key ? "G" : formatWorkflowStep(item.step)} ·{" "}
        {label}
      </span>
      <span className="w-full truncate text-center">{item.shortLabel}</span>
    </Link>
  );
}
