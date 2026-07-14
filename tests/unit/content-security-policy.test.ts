import { describe, expect, it } from "vitest";

import { createContentSecurityPolicy } from "@/lib/security/content-security-policy";

describe("createContentSecurityPolicy", () => {
  it("uses a nonce and disallows object and frame embedding", () => {
    const policy = createContentSecurityPolicy("test-nonce", false);

    expect(policy).toContain("'nonce-test-nonce'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
  });
});
