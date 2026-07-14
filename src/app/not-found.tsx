import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-4">
        <p className="font-mono text-sm">404</p>
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">
          The requested resource does not exist or is unavailable.
        </p>
        <Button asChild>
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </main>
  );
}
