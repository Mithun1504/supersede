import { createHash } from "node:crypto";

import { extractClaimsFromPastedText } from "@/modules/corpus/extraction";

const protocol = `Protocol P-114: Anticoagulation before neuraxial procedures

For patients with a coagulation marker of 52 or higher, hold the anticoagulant before the procedure and request specialist review.

When the marker is below 52 and there are no additional bleeding risks, continue the standard timing protocol.

Document the marker, the decision, and the approving clinician in the procedure record.`;

async function main() {
  const sourceHash = `sha256:${createHash("sha256").update(protocol).digest("hex")}`;
  const result = await extractClaimsFromPastedText({
    documentVersionId: "live-provider-gate",
    sourceHash,
    text: protocol,
    executionMode: "live",
  });

  if (!result.live || !result.provenance?.validated) {
    throw new Error(
      "The extraction did not complete through the live provider.",
    );
  }
  if (result.provenance.model !== "gpt-5.6") {
    throw new Error(`Expected gpt-5.6, received ${result.provenance.model}.`);
  }
  if (result.claims.length !== 3) {
    throw new Error(
      `Expected exactly three extracted claims, received ${result.claims.length}.`,
    );
  }
  if (result.claims.some((claim) => !claim.quoteVerified)) {
    throw new Error("At least one claim failed exact-quote verification.");
  }

  console.log(
    JSON.stringify({
      live: result.live,
      model: result.provenance.model,
      validated: result.provenance.validated,
      exactQuotesVerified: result.claims.length,
      latencyMs: result.provenance.latencyMs,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live gate failed.");
  process.exitCode = 1;
});
