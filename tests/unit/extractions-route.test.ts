import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/v1/extractions/route";
import { runStructuredOpenAiTask } from "@/ai/providers/openai";
import { getOptionalAuthContext } from "@/modules/identity/auth";
import { resolveActorContext } from "@/db/tenant-context";
import {
  ensureIngestedArtifactVersion,
  persistExtractedClaims,
} from "@/modules/corpus/persistence";

vi.mock("@/modules/identity/auth", () => ({
  getOptionalAuthContext: vi.fn(),
}));

vi.mock("@/db/tenant-context", () => ({
  resolveActorContext: vi.fn(),
}));

vi.mock("@/ai/providers/openai", () => ({
  runStructuredOpenAiTask: vi.fn(),
}));

vi.mock("@/modules/corpus/persistence", () => ({
  ensureIngestedArtifactVersion: vi.fn(),
  persistExtractedClaims: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  API_RATE_LIMITS: { extraction: {} },
  consumeRateLimit: vi.fn(),
}));

const authContext = {
  workosUserId: "user_123",
  workosOrganizationId: "org_123",
  email: "reviewer@example.com",
  displayName: "Reviewer",
};

describe("POST /api/v1/extractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOptionalAuthContext).mockResolvedValue(authContext);
    vi.mocked(resolveActorContext).mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      actorMembershipId: "00000000-0000-4000-8000-000000000002",
    });
    vi.mocked(ensureIngestedArtifactVersion).mockResolvedValue({
      artifactId: "00000000-0000-4000-8000-000000000003",
      artifactVersionId: "00000000-0000-4000-8000-000000000004",
    });
    vi.mocked(persistExtractedClaims).mockResolvedValue({
      persistedClaimCount: 1,
    });
    vi.mocked(runStructuredOpenAiTask).mockResolvedValue({
      output: {
        claims: [
          {
            text: "Hold therapy at threshold 42.",
            exactQuote: "threshold 42",
            evidence: {
              documentVersionId: "doc-v1",
              quote: "threshold 42",
              startOffset: null,
              endOffset: null,
              page: null,
              section: null,
              checksum: "sha256:test",
            },
            candidateSourceReferences: [],
            confidence: 0.82,
            ambiguity: null,
            reviewRequired: false,
          },
          {
            text: "This quote is absent.",
            exactQuote: "threshold 43",
            evidence: {
              documentVersionId: "doc-v1",
              quote: "threshold 43",
              startOffset: null,
              endOffset: null,
              page: null,
              section: null,
              checksum: "sha256:test",
            },
            candidateSourceReferences: [],
            confidence: 0.99,
            ambiguity: null,
            reviewRequired: false,
          },
        ],
      },
      provenance: {
        provider: "openai",
        model: "gpt-5.6",
        promptVersion: "claim_extraction_v1",
        schemaVersion: "1",
        sourceHashes: ["sha256:test"],
        retrievalChunkIds: [],
        externalResponseId: "resp_123",
        latencyMs: 10,
        validated: true,
      },
    });
  });

  it("requires Idempotency-Key before running extraction", async () => {
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(runStructuredOpenAiTask).not.toHaveBeenCalled();
  });

  it("runs live extraction and downgrades unverified quotes to review", async () => {
    const response = await POST(
      request({
        headers: { "Idempotency-Key": "idem-1" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.live).toBe(true);
    expect(body.claims).toMatchObject([
      {
        exactQuote: "threshold 42",
        quoteVerified: true,
        reviewState: "suggested",
      },
      {
        exactQuote: "threshold 43",
        quoteVerified: false,
        reviewState: "needs_review",
      },
    ]);
    expect(body.provenance.externalResponseId).toBe("resp_123");
    expect(body).toMatchObject({
      artifactVersionId: "00000000-0000-4000-8000-000000000004",
      persistedClaimCount: 1,
    });
    expect(persistExtractedClaims).toHaveBeenCalledOnce();
  });

  it("rejects deterministic fallback through the production API", async () => {
    const response = await POST(
      request({
        headers: { "Idempotency-Key": "idem-2" },
        body: { executionMode: "deterministic_fallback" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(runStructuredOpenAiTask).not.toHaveBeenCalled();
  });

  it("rejects a caller-forged source hash before running the model", async () => {
    const response = await POST(
      request({
        headers: { "Idempotency-Key": "idem-forged" },
        body: { sourceHash: `sha256:${"0".repeat(64)}` },
      }),
    );

    expect(response.status).toBe(422);
    expect(runStructuredOpenAiTask).not.toHaveBeenCalled();
  });

  it("requires an organization tenant", async () => {
    vi.mocked(getOptionalAuthContext).mockResolvedValue({
      ...authContext,
      workosOrganizationId: null,
    });

    const response = await POST(
      request({ headers: { "Idempotency-Key": "idem-3" } }),
    );

    expect(response.status).toBe(403);
    expect(runStructuredOpenAiTask).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    vi.mocked(getOptionalAuthContext).mockResolvedValue(null);

    const response = await POST(
      request({ headers: { "Idempotency-Key": "idem-4" } }),
    );

    expect(response.status).toBe(401);
    expect(runStructuredOpenAiTask).not.toHaveBeenCalled();
  });
});

function request(options?: {
  headers?: Record<string, string>;
  body?: {
    executionMode?: "live" | "deterministic_fallback";
    sourceHash?: string;
  };
}) {
  const text = "Protocol says threshold 42 for this cohort.";
  return new Request("http://localhost/api/v1/extractions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify({
      documentTitle: "Protocol fixture",
      sourceHash: `sha256:${createHash("sha256").update(text).digest("hex")}`,
      text,
      ...(options?.body ?? {}),
    }),
  });
}
import { createHash } from "node:crypto";
