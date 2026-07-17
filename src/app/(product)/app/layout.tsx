import Link from "next/link";
import { redirect } from "next/navigation";

import { ProductShell } from "@/components/layout/product-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isWorkOSConfigured } from "@/lib/env/server";
import { getOptionalAuthContext } from "@/modules/identity/auth";
import { requireCurrentActor } from "@/modules/identity/policy";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isWorkOSConfigured()) {
    return (
      <main className="grid min-h-dvh place-items-center p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Authentication setup required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>WorkOS is not configured</AlertTitle>
              <AlertDescription>
                Add the documented WorkOS variables to your local environment.
                Supersede does not bypass authentication, even in development.
              </AlertDescription>
            </Alert>
            <Button asChild variant="outline">
              <Link href="/">Return to the public site</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const auth = await getOptionalAuthContext();
  if (!auth) redirect("/sign-in");

  const actor = await requireCurrentActor();
  return <ProductShell actor={actor}>{children}</ProductShell>;
}
