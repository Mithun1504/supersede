import { FileText, Layers3, Plus } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCorpusDetail } from "@/modules/corpus/repository";
import { can, requireCurrentActor } from "@/modules/identity/policy";

export default async function CorpusDetailPage({
  params,
}: {
  params: Promise<{ corpusId: string }>;
}) {
  const { corpusId } = await params;
  const actor = await requireCurrentActor();
  const detail = await getCorpusDetail(actor, corpusId);
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Badge variant="outline" className="capitalize">
            {detail.corpus.status}
          </Badge>
          <h1 className="text-3xl font-semibold">{detail.corpus.name}</h1>
          <p className="text-muted-foreground max-w-2xl">
            {detail.corpus.description || "No corpus description provided."}
          </p>
        </div>
        {can(actor, "corpus.write") ? (
          <Button asChild>
            <Link href="/app/corpus/new">
              <Plus /> Add content
            </Link>
          </Button>
        ) : null}
      </div>

      <InventorySection
        title="Authoritative sources"
        description="Guidelines, standards, papers, regulations, and internal policy versions."
        icon={<FileText className="size-5" />}
        records={detail.sources.map((source) => ({
          ...source,
          href: `/app/sources/${source.id}`,
        }))}
      />
      <InventorySection
        title="Downstream artifacts"
        description="Governed materials whose meaning may depend on authoritative sources."
        icon={<Layers3 className="size-5" />}
        records={detail.artifacts.map((artifact) => ({
          ...artifact,
          href: `/app/artifacts/${artifact.id}`,
        }))}
      />
    </div>
  );
}

type InventoryRecord = {
  id: string;
  title: string;
  kind: string;
  href: string;
  versionLabel: string | null;
  recordStatus: string | null;
  processingStatus: string | null;
};

function InventorySection({
  title,
  description,
  icon,
  records,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  records: InventoryRecord[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed p-7 text-center text-sm">
            <p className="font-medium">Nothing in this section yet</p>
            <p className="text-muted-foreground mt-1">
              Ingest content to begin building the evidence graph.
            </p>
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {records.map((record) => (
              <Link
                key={record.id}
                href={record.href}
                className="hover:bg-muted/40 focus-visible:ring-ring flex flex-col justify-between gap-2 p-4 focus-visible:ring-2 focus-visible:outline-none sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-medium">{record.title}</p>
                  <p className="text-muted-foreground text-xs capitalize">
                    {record.kind.replaceAll("_", " ")} · Version{" "}
                    {record.versionLabel ?? "—"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {record.recordStatus ?? "unversioned"}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {record.processingStatus ?? "not processed"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
