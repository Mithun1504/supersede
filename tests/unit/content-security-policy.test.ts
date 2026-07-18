import { describe, expect, it } from "vitest";

import { createContentSecurityPolicy } from "@/lib/security/content-security-policy";

describe("createContentSecurityPolicy", () => {
  it("uses a strict nonce policy in production", () => {
    const policy = createContentSecurityPolicy("test-nonce", false);

    expect(policy).toContain("'nonce-test-nonce'");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(scriptDirective(policy)).not.toContain("'unsafe-inline'");
    expect(scriptDirective(policy)).not.toContain("'unsafe-eval'");
  });

  it("allows Turbopack development chunks without weakening production", () => {
    const policy = createContentSecurityPolicy("test-nonce", true);

    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).not.toContain("'nonce-test-nonce'");
    expect(policy).not.toContain("'strict-dynamic'");
  });
});

function scriptDirective(policy: string) {
  return policy
    .split("; ")
    .find((directive) => directive.startsWith("script-src"));
}
