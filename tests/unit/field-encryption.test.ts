import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("field encryption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("FIELD_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  });

  it("round-trips authenticated ciphertext without exposing plaintext", async () => {
    const { decryptField, encryptField } =
      await import("@/lib/security/field-encryption");
    const encrypted = encryptField("sensitive learner correction");
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("sensitive learner correction");
    expect(decryptField(encrypted)).toBe("sensitive learner correction");
  });

  it("rejects tampered ciphertext", async () => {
    const { decryptField, encryptField } =
      await import("@/lib/security/field-encryption");
    const encrypted = encryptField("tamper evident");
    const replacement = encrypted.endsWith("A") ? "B" : "A";
    expect(() =>
      decryptField(`${encrypted.slice(0, -1)}${replacement}`),
    ).toThrow();
  });
});
