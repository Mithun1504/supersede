import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-border/80 bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          className="flex items-center gap-3"
          href="/"
          aria-label="Supersede home"
        >
          <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg font-mono text-sm font-semibold">
            S
          </span>
          <span>
            <span className="block text-sm font-semibold">Supersede</span>
            <span className="text-muted-foreground block text-xs">
              Change propagation
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/app">Open workspace</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
