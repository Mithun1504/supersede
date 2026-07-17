import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api/validation";

const schema = z.object({ value: z.string() });

describe("JSON mutation request guards", () => {
  it("accepts same-origin JSON", async () => {
    const result = await parseJsonBody(
      new Request("https://app.example/api/write", {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          origin: "https://app.example",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ value: "ok" }),
      }),
      schema,
    );

    expect(result).toEqual({ value: "ok" });
  });

  it("rejects non-JSON bodies before parsing", async () => {
    await expect(
      parseJsonBody(
        new Request("https://app.example/api/write", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: JSON.stringify({ value: "unsafe" }),
        }),
        schema,
      ),
    ).rejects.toMatchObject({ status: 415 });
  });

  it("rejects cross-origin browser requests", async () => {
    await expect(
      parseJsonBody(
        new Request("https://app.example/api/write", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.example",
            "sec-fetch-site": "cross-site",
          },
          body: JSON.stringify({ value: "unsafe" }),
        }),
        schema,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
