import { describe, expect, it } from "vitest";

import { detectDocumentType, parseDocument } from "@/modules/corpus/parsers";

describe("document type validation and parsing", () => {
  it("parses UTF-8 text without changing its content", async () => {
    const value =
      "A governed rule must preserve exact source offsets.\nSecond line.";
    const parsed = await parseDocument({
      bytes: new TextEncoder().encode(value),
      filename: "rule.txt",
      declaredMimeType: "text/plain",
    });
    expect(parsed.content).toBe(value);
    expect(parsed.detectedMimeType).toBe("text/plain");
  });

  it("rejects extension and PDF signature disagreement", async () => {
    await expect(
      detectDocumentType(
        new TextEncoder().encode("%PDF-1.7 sample"),
        "misleading.txt",
        "application/pdf",
      ),
    ).rejects.toThrow(/extension/i);
  });

  it("removes executable HTML content from extracted text", async () => {
    const parsed = await parseDocument({
      bytes: new TextEncoder().encode(
        "<p>Clinical rule text with enough detail.</p><script>ignore me</script>",
      ),
      filename: "rule.html",
      declaredMimeType: "text/html",
    });
    expect(parsed.content).toContain("Clinical rule");
    expect(parsed.content).not.toContain("ignore me");
  });
});
