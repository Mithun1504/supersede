import { describe, expect, it } from "vitest";

import {
  classifyImpact,
  resolveReviewedEdgeImpact,
  traverseReviewedGraph,
} from "@/modules/graph";

describe("graph impact policy", () => {
  it("requires human review before a load-bearing score mandates a rewrite", () => {
    const candidate = classifyImpact({
      confidence: 0.9,
      loadBearingScore: 0.99,
      loadBearingRationale: "The dependent artifact fails without this claim.",
      reviewed: false,
    });
    const reviewed = classifyImpact({
      confidence: 0.9,
      loadBearingScore: 0.99,
      loadBearingRationale: "The dependent artifact fails without this claim.",
      reviewed: true,
    });

    expect(candidate).toMatchObject({
      class: "line_edit",
      score: 0.99,
      rationale: "The dependent artifact fails without this claim.",
    });
    expect(reviewed.class).toBe("rewrite_required");
  });

  it("applies the load-bearing threshold only to reviewed edge decisions", () => {
    expect(
      resolveReviewedEdgeImpact({
        decision: "accepted",
        loadBearingScore: 0.64,
      }),
    ).toBe("line_edit");
    expect(
      resolveReviewedEdgeImpact({
        decision: "accepted",
        loadBearingScore: 0.65,
      }),
    ).toBe("rewrite_required");
    expect(
      resolveReviewedEdgeImpact({
        decision: "overridden",
        loadBearingScore: 0.99,
        overrideClass: "peripheral",
      }),
    ).toBe("line_edit");
  });

  it("hard-clamps traversal to eight hops while preserving complete paths and cycles", () => {
    const chain = Array.from({ length: 10 }, (_, index) => ({
      id: `e${index}`,
      fromId: `n${index}`,
      toId: `n${index + 1}`,
      confidence: 0.9,
      reviewed: true,
    }));
    const traversal = traverseReviewedGraph("n0", chain, 100);
    const cycle = traverseReviewedGraph("a", [
      {
        id: "ab",
        fromId: "a",
        toId: "b",
        confidence: 0.9,
        reviewed: true,
      },
      {
        id: "ba",
        fromId: "b",
        toId: "a",
        confidence: 0.8,
        reviewed: true,
      },
    ]);

    expect(traversal.paths.at(-1)).toMatchObject({
      edgeIds: ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"],
      nodeIds: ["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"],
    });
    expect(traversal.paths).toHaveLength(8);
    expect(traversal.truncated).toBe(true);
    expect(cycle.cycles[0]).toMatchObject({
      edgeIds: ["ab", "ba"],
      nodeIds: ["a", "b", "a"],
      confidence: 0.8,
    });
  });
});
