import { Archive, ArrowRight, FileText, Layers3, Plus } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can, requireCurrentActor } from "@/modules/identity/policy";
import { listCorpora } from "@/modules/corpus/repository";

export const metadata: Metadata = { title: "Corpus" };

export default async function CorpusPage() {
  const actor = await requireCurrentActor();
  const corpora = await listCorpora(actor);
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Badge variant="secondary">Evidence library</Badge>
          <h1 className="text-3xl font-semibold">Corpora</h1>
          <p className="text-muted-foreground max-w-2xl">
            Versioned sources and downstream artifacts, preserved with exact
            hashes and evidence locations.
          </p>
        </div>
        {can(actor, "corpus.write") ? (
          <Button asChild>
            <Link href="/app/corpus/new">
              <Plus aria-hidden="true" /> Add content
            </Link>
          </Button>
        ) : null}
      </div>

      {corpora.length === 0 ? (
        <Card>
          <CardContent className="grid min-h-56 place-items-center p-8 text-center">
            <div>
              <Archive className="text-muted-foreground mx-auto mb-3 size-9" />
              <p className="font-medium">No corpus exists yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Create a governed collection before ingesting content.
              </p>
              {can(actor, "corpus.write") ? (
                <Button asChild className="mt-4">
                  <Link href="/app/corpus/new">Create first corpus</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {corpora.map((corpus) => (
            <Card key={corpus.id} className="group">
              <CardHeader>
                <CardTitle>{corpus.name}</CardTitle>
                <CardDescription className="line-clamp-2 min-h-10">
                  {corpus.description || "No description provided."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-muted-foreground flex gap-5 text-sm">
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-4" /> {corpus.sourceCount} sources
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Layers3 className="size-4" /> {corpus.artifactCount}{" "}
                    artifacts
                  </span>
                </div>
                <Button
                  asChild
                  variant="ghost"
                  className="group-hover:text-primary mt-4 px-0"
                >
                  <Link href={`/app/corpus/${corpus.id}`}>
                    Open corpus <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
