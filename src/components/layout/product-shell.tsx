import { Bell, ChevronDown } from "lucide-react";
import Link from "next/link";

import {
  Brand,
  DesktopNavigation,
  MobileNavigation,
  type NavigationItem,
} from "@/components/layout/product-navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/modules/identity/actions";
import { can, type CurrentActor } from "@/modules/identity/policy";

function navigationFor(actor: CurrentActor): NavigationItem[] {
  if (
    actor.roles.length === 1 &&
    actor.roles[0] === "learner" &&
    can(actor, "learning.complete")
  ) {
    return [
      { href: "/app", label: "My tasks", icon: "inbox" },
      { href: "/app/learning", label: "Learning", icon: "learning" },
    ];
  }

  const items: NavigationItem[] = [
    { href: "/app", label: "Overview", icon: "activity" },
    { href: "/app/inbox", label: "Inbox", icon: "inbox" },
  ];
  if (can(actor, "corpus.read")) {
    items.push({ href: "/app/corpus", label: "Corpus", icon: "archive" });
  }
  if (can(actor, "change.read")) {
    items.push({ href: "/app/changes", label: "Changes", icon: "changes" });
  }
  if (can(actor, "artifact.remediate_owned") || can(actor, "artifact.verify")) {
    items.push({
      href: "/app/remediations",
      label: "Remediation",
      icon: "activity",
    });
  }
  if (can(actor, "edge.review")) {
    items.push({ href: "/app/graph", label: "Graph", icon: "graph" });
  }
  if (can(actor, "case.read")) {
    items.push({ href: "/app/cases", label: "Cases", icon: "cases" });
  }
  if (can(actor, "release.prepare")) {
    items.push({ href: "/app/releases", label: "Releases", icon: "archive" });
  }
  if (can(actor, "learning.complete")) {
    items.push({ href: "/app/learning", label: "Learning", icon: "learning" });
  }
  if (can(actor, "result.read_aggregate")) {
    items.push({ href: "/app/reports", label: "Reports", icon: "reports" });
  }
  if (can(actor, "operations.read")) {
    items.push({
      href: "/app/operations",
      label: "Operations",
      icon: "activity",
    });
  }
  if (can(actor, "integration.manage")) {
    items.push({
      href: "/app/admin/integrations",
      label: "Integrations",
      icon: "settings",
    });
  }
  if (can(actor, "people.read")) {
    items.push({ href: "/app/people", label: "People", icon: "users" });
  }
  if (can(actor, "organization.read")) {
    items.push({
      href: "/app/admin/organization",
      label: "Administration",
      icon: "settings",
    });
  }
  return items;
}

export function ProductShell({
  actor,
  children,
}: {
  actor: CurrentActor;
  children: React.ReactNode;
}) {
  const navigation = navigationFor(actor);
  const initials = actor.membership.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-dvh">
      <DesktopNavigation items={navigation} />
      <div className="min-w-0 flex-1">
        <header className="bg-background/90 sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNavigation items={navigation} />
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-medium">
                {actor.organization.name}
              </p>
              <Badge variant="secondary" className="mt-0.5 capitalize">
                {actor.organization.productConfiguration}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              asChild
            >
              <Link href="/app/notifications">
                <Bell aria-hidden="true" />
              </Link>
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 px-2">
                  <span className="bg-secondary text-secondary-foreground grid size-7 place-items-center rounded-full text-xs font-semibold">
                    {initials}
                  </span>
                  <span className="hidden max-w-40 truncate sm:inline">
                    {actor.membership.displayName}
                  </span>
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <span className="block truncate">
                    {actor.membership.displayName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs font-normal">
                    {actor.membership.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <form action={signOutAction} className="w-full">
                    <button type="submit" className="w-full text-left">
                      Sign out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
