"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  BookOpenCheck,
  Building2,
  FileClock,
  GitBranch,
  Inbox,
  Menu,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

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

const icons = {
  activity: Activity,
  archive: Archive,
  building: Building2,
  cases: BookOpenCheck,
  changes: FileClock,
  graph: GitBranch,
  inbox: Inbox,
  learning: Sparkles,
  reports: ShieldCheck,
  settings: Settings2,
  users: Users,
} satisfies Record<string, LucideIcon>;

export type NavigationItem = {
  href: string;
  label: string;
  icon: keyof typeof icons;
};

function NavigationLinks({
  items,
  onNavigate,
}: {
  items: NavigationItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Workspace navigation" className="space-y-1">
      {items.map((item) => {
        const Icon = icons[item.icon];
        const active =
          item.href === "/app"
            ? pathname === item.href
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DesktopNavigation({ items }: { items: NavigationItem[] }) {
  return (
    <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-dvh w-64 shrink-0 border-r p-4 lg:block">
      <Brand />
      <div className="mt-8">
        <NavigationLinks items={items} />
      </div>
    </aside>
  );
}

export function MobileNavigation({ items }: { items: NavigationItem[] }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu aria-hidden="true" />
          <span className="sr-only">Open workspace navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-sidebar w-[20rem] max-w-[88vw]">
        <SheetHeader className="border-sidebar-border border-b">
          <SheetTitle>Supersede</SheetTitle>
          <SheetDescription>Workspace navigation</SheetDescription>
        </SheetHeader>
        <div className="px-3">
          <NavigationLinks items={items} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Brand() {
  return (
    <Link
      href="/app"
      className="focus-visible:ring-ring flex items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      aria-label="Supersede workspace home"
    >
      <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg font-mono text-sm font-bold shadow-sm">
        S
      </span>
      <span>
        <span className="block text-sm font-semibold">Supersede</span>
        <span className="text-muted-foreground block text-xs">
          Governed change
        </span>
      </span>
    </Link>
  );
}
