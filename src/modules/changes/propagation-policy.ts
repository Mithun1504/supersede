import { GOVERNED_AI_THRESHOLDS } from "@/ai/contracts/tasks";

export type PropagationImpactKind =
  "load_bearing" | "peripheral" | "person_exposure";

export function classifyPropagationImpact(
  objectType: string,
  loadBearingScore?: number,
): {
  impactKind: PropagationImpactKind;
  rewriteRequired: "yes" | "no" | "candidate";
} {
  if (objectType === "person" || objectType === "professional_role") {
    return { impactKind: "person_exposure", rewriteRequired: "no" };
  }

  if (
    loadBearingScore !== undefined &&
    loadBearingScore >= GOVERNED_AI_THRESHOLDS.rewriteRequired
  ) {
    return { impactKind: "load_bearing", rewriteRequired: "yes" };
  }

  return {
    impactKind: "peripheral",
    rewriteRequired: loadBearingScore === undefined ? "candidate" : "no",
  };
}

export function combinePathConfidence(confidences: number[]) {
  return confidences.reduce(
    (combined, confidence) => combined * Math.max(0, Math.min(1, confidence)),
    1,
  );
}
