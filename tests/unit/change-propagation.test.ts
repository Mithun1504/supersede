import { describe, expect, it } from "vitest";

import {
  classifyPropagationImpact,
  combinePathConfidence,
} from "@/modules/changes/propagation-policy";
import { changeValidatedPayloadSchema } from "@/inngest/functions/change-propagation";

describe("validated change propagation policy", () => {
  it("uses the governed 0.65 load-bearing threshold", () => {
    expect(classifyPropagationImpact("artifact_version", 0.65)).toEqual({
      impactKind: "load_bearing",
      rewriteRequired: "yes",
    });
    expect(classifyPropagationImpact("artifact_version", 0.649)).toEqual({
      impactKind: "peripheral",
      rewriteRequired: "no",
    });
  });

  it("keeps unscored artifacts as review candidates", () => {
    expect(classifyPropagationImpact("artifact_version")).toEqual({
      impactKind: "peripheral",
      rewriteRequired: "candidate",
    });
  });

  it("never classifies role or person exposure as a rewrite", () => {
    expect(classifyPropagationImpact("professional_role", 0.99)).toEqual({
      impactKind: "person_exposure",
      rewriteRequired: "no",
    });
    expect(classifyPropagationImpact("person", 0.99)).toEqual({
      impactKind: "person_exposure",
      rewriteRequired: "no",
    });
  });

  it("combines confidence across the complete reviewed path", () => {
    expect(combinePathConfidence([0.9, 0.8, 0.5])).toBeCloseTo(0.36);
  });

  it("rejects malformed workflow events before database work", () => {
    expect(() =>
      changeValidatedPayloadSchema.parse({
        organizationId: "not-a-uuid",
        actorMembershipId: "also-not-a-uuid",
        changeEventVersionId: "missing",
      }),
    ).toThrow();
  });
});
