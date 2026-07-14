import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("*/api/v1/health", () =>
    HttpResponse.json({
      status: "ok",
      service: "supersede-web",
      timestamp: "2026-07-14T00:00:00.000Z",
      configuration: {},
    }),
  ),
];
