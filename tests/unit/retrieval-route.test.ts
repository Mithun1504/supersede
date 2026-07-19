import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/v1/retrieval/route";
import { resolveActorContext } from "@/db/tenant-context";
import { hybridRetrieve } from "@/modules/corpus";
import { getOptionalAuthContext } from "@/modules/identity/auth";

vi.mock("@/modules/identity/auth", () => ({
  getOptionalAuthContext: vi.fn(),
}));

vi.mock("@/db/tenant-context", () => ({
  resolveActorContext: vi.fn(),
}));

vi.mock("@/modules/corpus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/corpus")>();
  return { ...actual, hybridRetrieve: vi.fn() };
});

vi.mock("@/lib/security/rate-limit", () => ({
  API_RATE_LIMITS: { retrieval: {} },
  consumeRateLimit: vi.fn(),
}));

describe("POST /api/v1/retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOptionalAuthContext).mockResolvedValue({
      workosUserId: "user_123",
      workosOrganizationId: "org_123",
      email: "reviewer@example.com",
      displayName: "Reviewer",
    });
    vi.mocked(resolveActorContext).mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      actorMembershipId: "00000000-0000-4000-8000-000000000002",
    });
    vi.mocked(hybridRetrieve).mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000003",
        artifactVersionId: "00000000-0000-4000-8000-000000000004",
        sourceVersionId: null,
        text: "Use the active threshold of 68.",
        pageLabel: "1",
        sectionLabel: "Treatment threshold",
        score: 0.031,
      },
    ]);
  });

  it("returns filtered hybrid evidence for an authenticated tenant", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/retrieval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "active threshold 68", limit: 5 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(hybridRetrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "00000000-0000-4000-8000-000000000001",
      }),
      expect.objectContaining({ query: "active threshold 68", limit: 5 }),
    );
  });

  it("rejects malformed retrieval input before querying", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/retrieval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(hybridRetrieve).not.toHaveBeenCalled();
  });
});
