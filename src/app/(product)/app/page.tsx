import Link from "next/link";
import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/site-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isWorkOSConfigured } from "@/lib/env/server";
import { getOptionalAuthContext } from "@/modules/identity/auth";
import { signOutAction } from "@/modules/identity/actions";

export const metadata: Metadata = {
  title: "Workspace",
};

export const dynamic = "force-dynamic";

const moduleBoundaries = [
  "Identity & tenant policy",
  "Corpus & evidence",
  "Dependency graph",
  "Change events",
  "Cases & learning",
  "Audit & integrations",
] as const;

export default async function WorkspacePage() {
  const authConfigured = isWorkOSConfigured();
  const auth = await getOptionalAuthContext();

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Badge variant="secondary">Foundation workspace</Badge>
            <h1 className="text-3xl font-semibold">
              Ready for feature development
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              The shell verifies authentication, theming, server rendering, and
              domain boundaries without implementing product workflows.
            </p>
          </div>
          {auth ? (
            <form action={signOutAction}>
              <Button variant="outline" type="submit">
                Sign out
              </Button>
            </form>
          ) : null}
        </div>

        {!authConfigured ? (
          <Alert>
            <AlertTitle>Local authentication bypass</AlertTitle>
            <AlertDescription>
              WorkOS variables are unset. Add them to <code>.env.local</code> to
              exercise hosted sign-in and organization context.
            </AlertDescription>
          </Alert>
        ) : null}

        {authConfigured && !auth ? (
          <Card>
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
              <CardDescription>
                Authenticate through WorkOS AuthKit to open the workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleBoundaries.map((module) => (
              <Card key={module}>
                <CardHeader>
                  <CardTitle className="text-base">{module}</CardTitle>
                  <CardDescription>
                    Module boundary established; no feature behavior yet.
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
