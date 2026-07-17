import type { Metadata } from "next";

import { ArrowRight, GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReviewedGraph } from "@/modules/graph/components/reviewed-graph";
import { getReviewedGraph, listGraphEdges } from "@/modules/graph/repository";
import { requirePermission } from "@/modules/identity/policy";

export const metadata: Metadata = { title: "Dependency graph" };

export default async function GraphPage() {
  const actor = await requirePermission("edge.review");
  const [edges, graph] = await Promise.all([
    listGraphEdges(actor),
    getReviewedGraph(actor),
  ]);
  const accepted = edges.filter((edge) => edge.reviewStatus === "accepted");
  const candidates = edges.length - accepted.length;

  return (
    <div className="space-y-7">
      <div>
        <p className="text-muted-foreground text-sm">Governed dependencies</p>
        <h1 className="text-3xl font-semibold">Evidence graph</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Accepted relationships drive authoritative propagation. Suggested and
          low-confidence candidates remain visibly separate until review.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Accepted current edges</CardDescription>
            <CardTitle className="text-3xl">{accepted.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Review candidates</CardDescription>
            <CardTitle className="text-3xl">{candidates}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      {edges.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No graph relationships yet</CardTitle>
            <CardDescription>
              Extract claims from an artifact, then review the resulting claims
              and source links.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {graph.edges.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Accepted dependency map</CardTitle>
                <CardDescription>
                  Pan and zoom the current reviewed graph. The relationship
                  cards below provide the complete keyboard-accessible view.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReviewedGraph nodes={graph.nodes} edges={graph.edges} />
              </CardContent>
            </Card>
          ) : null}
          {edges.map((edge) => (
            <Card key={edge.edgeVersionId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GitBranch
                      className="text-muted-foreground size-4"
                      aria-hidden="true"
                    />
                    <CardTitle className="text-base capitalize">
                      {edge.edgeType.replaceAll("_", " ")}
                    </CardTitle>
                  </div>
                  <Badge
                    variant={
                      edge.reviewStatus === "accepted" ? "default" : "secondary"
                    }
                    className="capitalize"
                  >
                    {edge.reviewStatus.replaceAll("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <Node type={edge.fromType} label={edge.fromLabel} />
                  <ArrowRight
                    className="text-muted-foreground hidden size-4 sm:block"
                    aria-hidden="true"
                  />
                  <Node type={edge.toType} label={edge.toLabel} />
                </div>
                <blockquote className="border-primary/40 bg-muted/40 rounded-r-lg border-l-4 p-3 text-sm">
                  “{edge.quote}”
                </blockquote>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  <span>Confidence {Math.round(edge.confidence * 100)}%</span>
                  <span>
                    Load bearing {Math.round(edge.loadBearingScore * 100)}%
                  </span>
                  <span className="text-muted-foreground">
                    {edge.rationale}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Node({ type, label }: { type: string; label: string }) {
  return (
    <div className="border-border bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-xs capitalize">
        {type.replaceAll("_", " ")}
      </p>
      <p className="mt-1 line-clamp-3 text-sm font-medium">{label}</p>
    </div>
  );
}
