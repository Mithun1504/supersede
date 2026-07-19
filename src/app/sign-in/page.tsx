import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProductMark } from "@/components/product/product-mark";
import { Button } from "@/components/ui/button";
import { isWorkOSConfigured } from "@/lib/env/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requestedReturnTo = (await searchParams).returnTo;
  const requestedPath = Array.isArray(requestedReturnTo)
    ? requestedReturnTo[0]
    : requestedReturnTo;
  const returnTo =
    requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/app";

  if (isWorkOSConfigured()) {
    redirect(await getSignInUrl({ returnTo }));
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6 sm:p-10">
      <section className="app-surface w-full max-w-2xl overflow-hidden">
        <header className="border-border flex items-center gap-3 border-b px-5 py-4 sm:px-7">
          <ProductMark className="text-primary" />
          <p className="font-heading text-lg font-semibold">Supersede</p>
        </header>
        <div className="px-5 py-8 sm:px-7 sm:py-10">
          <h1 className="max-w-xl text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
            Live sign-in is unavailable in this demo
          </h1>
          <p className="text-muted-foreground mt-4 max-w-[62ch] text-sm leading-6 sm:text-base">
            This workspace is intentionally read-only. Review the seeded St.
            Marlowe record and download its prepared audit packet without an
            account.
          </p>
          <div className="mt-7">
            <Button asChild>
              <Link href={returnTo}>Return to the public workspace</Link>
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground border-border bg-muted/20 border-t px-5 py-4 text-xs leading-5 sm:px-7">
          Live intake and governed write actions are disabled for this public
          submission.
        </p>
      </section>
    </main>
  );
}
