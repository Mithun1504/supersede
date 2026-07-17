import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateCorpusForm } from "@/modules/corpus/components/create-corpus-form";
import { PasteDocumentForm } from "@/modules/corpus/components/paste-document-form";
import { UploadDocumentForm } from "@/modules/corpus/components/upload-document-form";
import { listCorpora } from "@/modules/corpus/repository";
import { getServerEnv } from "@/lib/env/server";
import { requirePermission } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Add corpus content" };

export default async function NewCorpusContentPage() {
  const actor = await requirePermission("corpus.write");
  const corpora = await listCorpora(actor);
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">Corpus ingestion</p>
        <h1 className="text-3xl font-semibold">Add governed content</h1>
      </div>
      {corpora.length === 0 ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Create a corpus</CardTitle>
            <CardDescription>
              A corpus scopes retrieval, review metrics, and related source and
              artifact versions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateCorpusForm />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload a governed document</CardTitle>
              <CardDescription>
                Files enter private quarantine, are verified by content
                signature, extracted, deduplicated, and indexed with
                reproducible evidence offsets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadDocumentForm
                corpora={corpora.map(({ id, name }) => ({ id, name }))}
                curatedDemoUploads={getServerEnv().CURATED_DEMO_UPLOADS}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Paste exact document text</CardTitle>
              <CardDescription>
                The credential-free ingestion path. Pasted content uses the same
                immutable governed-object pipeline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PasteDocumentForm
                corpora={corpora.map(({ id, name }) => ({ id, name }))}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
