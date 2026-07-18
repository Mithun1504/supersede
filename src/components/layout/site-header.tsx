import Link from "next/link";

import { ProductMark } from "@/components/product/product-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-border bg-background sticky top-0 z-40 border-b">
      <a
        className="bg-background text-foreground focus-visible:ring-ring fixed top-2 left-2 z-50 -translate-y-16 border px-3 py-2 text-sm font-bold focus-visible:translate-y-0 focus-visible:ring-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link
          className="focus-visible:ring-ring flex items-center gap-2 focus-visible:ring-3"
          href="/"
          aria-label="Supersede home"
        >
          <ProductMark className="size-6" />
          <span className="font-heading text-lg font-semibold">Supersede</span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="ml-auto hidden items-center gap-6 md:flex"
        >
          <Link
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring text-sm font-bold transition-colors duration-150 focus-visible:ring-3"
            href="/#method"
          >
            Method
          </Link>
          <Link
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring text-sm font-bold transition-colors duration-150 focus-visible:ring-3"
            href="/app/walkthrough"
          >
            Demo guide
          </Link>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <span className="hidden sm:inline-flex">
            <ThemeToggle />
          </span>
          <Button asChild size="sm">
            <Link href="/app">Open workspace</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
