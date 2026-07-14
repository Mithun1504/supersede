import "@testing-library/jest-dom/vitest";

import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { mockServer } from "./mocks/server";

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: vi.fn(() => null),
});

beforeAll(() => mockServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());
