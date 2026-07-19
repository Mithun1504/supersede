import "server-only";

import { createHash } from "node:crypto";

import {
  changeDiffSchema,
  divergenceCaseSchema,
  enforceProbeGradePolicy,
  loadBearingSchema,
  probeGradeSchema,
  artifactFeedbackSchema,
} from "@/ai/contracts/tasks";
import type { SourceCitation } from "@/ai/contracts/tasks";
import { runStructuredOpenAiTask } from "@/ai/providers/openai";
import { governedAiTasks } from "@/ai/prompts/governed";
import { verifyQuotedEvidence } from "@/modules/corpus";
import { AppError } from "@/lib/errors/app-error";

type GovernedRunOptions = { idempotencyKey?: string };

export async function assessLoadBearing(
  input: {
    claim: string;
    artifactText: string;
    sourceHash: string;
  },
  options: GovernedRunOptions = {},
) {
  assertSourceHash(input.artifactText, input.sourceHash);
  const run = await runStructuredOpenAiTask({
    task: governedAiTasks.loadBearing,
    input,
    sourceHashes: [input.sourceHash],
    ...(options.idempotencyKey
      ? { idempotencyKey: options.idempotencyKey }
      : {}),
  });
  const result = loadBearingSchema.parse(run.output);
  const quotesVerified = result.evidenceQuotes.every(
    (quote) => verifyQuotedEvidence(input.artifactText, quote).verified,
  );

  return {
    ...result,
    quotesVerified,
    reviewRequired: true as const,
    proposedClass: quotesVerified ? result.class : ("unclear" as const),
    provenance: run.provenance,
  };
}

export async function normalizeChangeDiff(
  input: {
    oldVersionId: string;
    oldText: string;
    oldHash: string;
    newVersionId: string;
    newText: string;
    newHash: string;
  },
  options: GovernedRunOptions = {},
) {
  assertSourceHash(input.oldText, input.oldHash);
  assertSourceHash(input.newText, input.newHash);
  const run = await runStructuredOpenAiTask({
    task: governedAiTasks.changeDiff,
    input,
    sourceHashes: [input.oldHash, input.newHash],
    ...(options.idempotencyKey
      ? { idempotencyKey: options.idempotencyKey }
      : {}),
  });
  const result = changeDiffSchema.parse(run.output);
  const oldVerified = result.citations.old.every((citation) =>
    verifiesCitation(
      citation,
      input.oldVersionId,
      input.oldText,
      input.oldHash,
    ),
  );
  const newVerified = result.citations.new.every((citation) =>
    verifiesCitation(
      citation,
      input.newVersionId,
      input.newText,
      input.newHash,
    ),
  );

  return {
    ...result,
    citationsVerified: oldVerified && newVerified,
    reviewRequired:
      Boolean(result.unresolvedAmbiguity) || !oldVerified || !newVerified,
    provenance: run.provenance,
  };
}

export async function generateDivergenceCases(
  input: {
    changeEventVersionId: string;
    oldVersionId: string;
    oldText: string;
    oldHash: string;
    newVersionId: string;
    newText: string;
    newHash: string;
  },
  options: GovernedRunOptions = {},
) {
  assertSourceHash(input.oldText, input.oldHash);
  assertSourceHash(input.newText, input.newHash);
  const run = await runStructuredOpenAiTask({
    task: governedAiTasks.divergenceCase,
    input,
    sourceHashes: [input.oldHash, input.newHash],
    ...(options.idempotencyKey
      ? { idempotencyKey: options.idempotencyKey }
      : {}),
  });
  const result = divergenceCaseSchema.parse(run.output);

  return {
    cases: result.cases.map((candidate) => {
      const citationsVerified =
        candidate.citations.old.every((citation) =>
          verifiesCitation(
            citation,
            input.oldVersionId,
            input.oldText,
            input.oldHash,
          ),
        ) &&
        candidate.citations.new.every((citation) =>
          verifiesCitation(
            citation,
            input.newVersionId,
            input.newText,
            input.newHash,
          ),
        );
      return {
        ...candidate,
        status: "draft" as const,
        citationsVerified,
        reviewRequired: true as const,
        releasable: false as const,
      };
    }),
    provenance: run.provenance,
  };
}

export async function gradeProbeResponse(
  input: {
    responseText: string;
    approvedCaseRationale: string;
    oldAnswer: string;
    newAnswer: string;
    caseVersionHash: string;
  },
  options: GovernedRunOptions = {},
) {
  const normalizedResponse = normalizeAnswer(input.responseText);
  const normalizedOld = normalizeAnswer(input.oldAnswer);
  const normalizedNew = normalizeAnswer(input.newAnswer);
  if (
    normalizedResponse === normalizedOld ||
    normalizedResponse === normalizedNew
  ) {
    const answeredWith =
      normalizedResponse === normalizedOld
        ? ("old" as const)
        : ("new" as const);
    return {
      answeredWith,
      confidence: 1,
      exactQuote: input.responseText,
      matchedApprovedCaseRationale: input.approvedCaseRationale,
      reviewRequired: false,
      provenance: {
        provider: "deterministic-policy",
        model: "exact-answer-match-v1",
        promptVersion: "probe_grade_exact_v1",
        schemaVersion: "probe_grade_v1",
        sourceHashes: [input.caseVersionHash],
        retrievalChunkIds: [],
        latencyMs: 0,
        validated: true,
      },
    };
  }
  const run = await runStructuredOpenAiTask({
    task: governedAiTasks.probeGrade,
    input,
    sourceHashes: [input.caseVersionHash],
    ...(options.idempotencyKey
      ? { idempotencyKey: options.idempotencyKey }
      : {}),
  });
  const parsed = probeGradeSchema.parse(run.output);
  return {
    ...enforceProbeGradePolicy(
      parsed,
      input.approvedCaseRationale,
      input.responseText,
    ),
    provenance: run.provenance,
  };
}

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[.\s]+$/g, "")
    .replace(/\s+/g, " ");
}

export async function assessArtifactCorrection(
  input: {
    submittedPatch: string;
    rubric: string;
    approvedNewSourceText: string;
    sourceHash: string;
  },
  options: GovernedRunOptions = {},
) {
  assertSourceHash(input.approvedNewSourceText, input.sourceHash);
  const run = await runStructuredOpenAiTask({
    task: governedAiTasks.artifactFeedback,
    input,
    sourceHashes: [input.sourceHash],
    ...(options.idempotencyKey
      ? { idempotencyKey: options.idempotencyKey }
      : {}),
  });
  const result = artifactFeedbackSchema.parse(run.output);
  const quotesVerified = result.evidenceQuotes.every(
    (quote) =>
      verifyQuotedEvidence(input.approvedNewSourceText, quote).verified,
  );
  return {
    ...result,
    passed: quotesVerified && result.passed,
    quotesVerified,
    reviewRequired: result.reviewRequired || !quotesVerified,
    provenance: run.provenance,
  };
}

function verifiesCitation(
  citation: SourceCitation,
  versionId: string,
  text: string,
  hash: string,
) {
  return (
    citation.sourceVersionId === versionId &&
    citation.location.documentVersionId === versionId &&
    citation.location.checksum === hash &&
    citation.location.quote === citation.quote &&
    verifyQuotedEvidence(text, citation.quote).verified
  );
}

function assertSourceHash(text: string, claimedHash: string) {
  const computedHash = `sha256:${createHash("sha256").update(text).digest("hex")}`;
  if (claimedHash !== computedHash) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Source hash does not match the submitted text.",
      status: 422,
    });
  }
}
