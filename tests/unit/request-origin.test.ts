import { describe, expect, it } from "vitest";

import { assertSameOrigin } from "@/lib/security/request-origin";

describe("same-origin mutation guard", () => {
  it("accepts a browser same-origin request", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://app.example.test/api/export", {
          method: "POST",
          headers: {
            origin: "https://app.example.test",
            "sec-fetch-site": "same-origin",
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects a cross-origin request", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://app.example.test/api/export", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toThrow("Cross-origin");
  });
});
