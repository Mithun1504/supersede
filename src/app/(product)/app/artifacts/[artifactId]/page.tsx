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
import { getArtifactDetail } from "@/modules/corpus/repository";
import { approveArtifactVersionAction } from "@/modules/corpus/actions";
import { ExtractionButton } from "@/modules/ai/components/extraction-button";
import { getServerEnv } from "@/lib/env/server";
import { requireCurrentActor } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Artifact" };

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;
  const actor = await requireCurrentActor();
  const { artifact, versions, owners } = await getArtifactDetail(
    actor,
    artifactId,
  );
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <Badge className="capitalize">
          {artifact.kind.replaceAll("_", " ")}
        </Badge>
        <h1 className="text-3xl font-semibold">{artifact.title}</h1>
        <p className="text-muted-foreground text-sm">
          {artifact.externalReference ?? "No external reference"}
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Immutable version history</CardTitle>
            <CardDescription>
              Drafts become governed only through explicit approval and
              supersession.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y rounded-xl border p-0">
            {versions.map((version) => (
              <div key={version.id} className="p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">Version {version.versionLabel}</p>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {version.recordStatus}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {version.processingStatus}
                    </Badge>
                  </div>
                </div>
                <p className="text-muted-foreground mt-2 font-mono text-xs break-all">
                  SHA-256 {version.contentSha256}
                </p>
                {actor.permissions.includes("edge.review") ? (
                  version.recordStatus === "approved" ? (
                    <ExtractionButton
                      artifactVersionId={version.id}
                      configured={Boolean(
                        getServerEnv().OPENAI_API_KEY &&
                        getServerEnv().GEMINI_API_KEY,
                      )}
                    />
                  ) : version.createdByMembershipId !== actor.membership.id ? (
                    <form
                      action={approveArtifactVersionAction}
                      className="mt-3"
                    >
                      <input
                        type="hidden"
                        name="artifactVersionId"
                        value={version.id}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Approve current version
                      </Button>
                    </form>
                  ) : null
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Active owners</CardTitle>
            <CardDescription>
              Ownership grants narrow remediation access, not approval
              authority.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {owners.map((owner) => (
              <div key={`${owner.membershipId}:${owner.ownerType}`}>
                <p className="text-sm font-medium">{owner.displayName}</p>
                <p className="text-muted-foreground text-xs capitalize">
                  {owner.ownerType} · {owner.email}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
