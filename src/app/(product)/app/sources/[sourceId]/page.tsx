import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSourceDetail } from "@/modules/corpus/repository";
import { approveSourceVersionAction } from "@/modules/corpus/actions";
import { AddSourceVersionForm } from "@/modules/corpus/components/add-source-version-form";
import { Button } from "@/components/ui/button";
import { requireCurrentActor } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Source" };

export default async function SourcePage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId } = await params;
  const actor = await requireCurrentActor();
  const { source, versions, corpusId } = await getSourceDetail(actor, sourceId);
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <Badge className="capitalize">{source.kind.replaceAll("_", " ")}</Badge>
        <h1 className="text-3xl font-semibold">{source.title}</h1>
        <p className="text-muted-foreground text-sm">
          Owner: {source.ownerName ?? "Unassigned"}
        </p>
        {source.canonicalReference ? (
          <p className="flex items-center gap-1 text-sm">
            <ExternalLink className="size-4" /> {source.canonicalReference}
          </p>
        ) : null}
      </div>
      <VersionHistory
        versions={versions}
        canApprove={actor.permissions.includes("edge.review")}
        actorMembershipId={actor.membership.id}
      />
      {corpusId && actor.permissions.includes("corpus.write") ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a successor version</CardTitle>
            <CardDescription>
              Successors remain immutable and link explicitly to the preceding
              version.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddSourceVersionForm source={source} corpusId={corpusId} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function VersionHistory({
  versions,
  canApprove,
  actorMembershipId,
}: {
  versions: Array<{
    id: string;
    versionNumber: number;
    versionLabel: string;
    recordStatus: string;
    processingStatus: string;
    effectiveAt: Date;
    contentSha256: string;
    createdByMembershipId: string;
  }>;
  canApprove: boolean;
  actorMembershipId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Immutable version history</CardTitle>
        <CardDescription>
          Every successor retains its exact document checksum and governance
          state.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y rounded-xl border p-0">
        {versions.map((version) => (
          <div
            key={version.id}
            className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-medium">Version {version.versionLabel}</p>
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                SHA-256 {version.contentSha256}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Badge variant="secondary" className="capitalize">
                {version.recordStatus}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {version.processingStatus}
              </Badge>
              {canApprove &&
              version.recordStatus !== "approved" &&
              version.createdByMembershipId !== actorMembershipId ? (
                <form action={approveSourceVersionAction}>
                  <input
                    type="hidden"
                    name="sourceVersionId"
                    value={version.id}
                  />
                  <Button type="submit" size="xs" variant="outline">
                    Approve current
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
