import { describe, expect, it, vi } from "vitest";

vi.mock("@workos-inc/authkit-nextjs", () => ({
  applyResponseHeaders: vi.fn(),
  authkit: vi.fn(),
  partitionAuthkitHeaders: vi.fn(),
}));

describe("proxy matcher", () => {
  it("keeps product prefetches inside the AuthKit request boundary", async () => {
    const { config } = await import("@/proxy");

    expect(config.matcher).toEqual([
      {
        source:
          "/((?!api/inngest|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
      },
    ]);
  });
});
