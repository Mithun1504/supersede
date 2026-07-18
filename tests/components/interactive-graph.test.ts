import { describe, expect, it } from "vitest";

import {
  getGraphContextIds,
  getReachableIds,
  type GraphItem,
} from "@/components/product/interactive-graph";

describe("dependency graph reachability", () => {
  it("keeps only records connected to the source by declared parents", () => {
    const items = [
      item("source", "source"),
      item("claim", "claim", ["source"]),
      item("artifact", "artifact", ["claim"]),
      item("role", "role", ["artifact"]),
      item("detached-claim", "claim"),
      item("detached-artifact", "artifact", ["detached-claim"]),
      item("detached-role", "role", ["detached-artifact"]),
    ];

    expect([...getReachableIds(items)]).toEqual([
      "source",
      "claim",
      "artifact",
      "role",
    ]);
  });

  it("focuses an artifact on its ancestors and descendants without sibling paths", () => {
    const items = [
      item("source", "source"),
      item("claim-a", "claim", ["source"]),
      item("artifact-a", "artifact", ["claim-a"]),
      item("role-a", "role", ["artifact-a"]),
      item("claim-b", "claim", ["source"]),
      item("artifact-b", "artifact", ["claim-b"]),
    ];

    expect([...getGraphContextIds(items, new Set(["artifact-a"]))]).toEqual([
      "artifact-a",
      "claim-a",
      "source",
      "role-a",
    ]);
  });
});

function item(
  id: string,
  stage: GraphItem["stage"],
  parentIds: string[] = [],
): GraphItem {
  return {
    id,
    stage,
    parentIds,
    title: id,
    meta: id,
    status: "Recorded",
    tone: stage === "source" ? "success" : "impacted",
  };
}
