"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="grid min-h-dvh place-items-center p-6">
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold">Supersede could not load</h1>
            <Button onClick={reset}>Try again</Button>
          </div>
        </main>
      </body>
    </html>
  );
}
