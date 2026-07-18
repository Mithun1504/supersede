import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIResponse, type Page } from "@playwright/test";

const publicRoutes = [
  ["/", "Version control for organizational knowledge."],
  ["/app", "Change Room"],
  ["/app/review", "Evidence review queue"],
  ["/app/graph", "Graph Briefing"],
  ["/app/changes", "Change events"],
  ["/app/blast-radius", "Blast radius"],
  ["/app/cases", "Divergence cases"],
  ["/app/probes", "Instinct probes"],
  ["/app/audit", "Audit"],
  ["/app/walkthrough", "Read-only product walkthrough"],
] as const;

test.describe("public release surfaces", () => {
  for (const [path, heading] of publicRoutes) {
    test(`${path} renders accessibly without viewport overflow`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      expect(response?.headers()["content-security-policy"]).toContain(
        "default-src 'self'",
      );
      await expect(
        page.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
      await expectNoPageOverflow(page);

      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        accessibility.violations,
        `${path} accessibility violations:\n${formatViolations(accessibility.violations)}`,
      ).toEqual([]);
    });
  }
});

test("public walkthrough is visibly seeded and read-only", async ({ page }) => {
  await page.goto("/app/walkthrough");

  await expect(page.getByText("Public seeded walkthrough")).toBeVisible();
  await expect(
    page.getByText(
      /safe for public review because it uses fictional clinical content/i,
    ),
  ).toBeVisible();
  await expect(
    page.locator("main form, main button, main input, main textarea"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /role|persona|impersonat/i }),
  ).toHaveCount(0);
});

test("anonymous mutation endpoints return problem details", async ({
  request,
}) => {
  const mutations = [
    request.post("/api/v1/extractions", {
      headers: { "idempotency-key": "e2e-anonymous-extraction" },
      data: {
        documentVersionId: "e2e-document-version",
        sourceHash: `sha256:${"a".repeat(64)}`,
        text: "A changed rule with enough text to reach the authentication boundary.",
        executionMode: "live",
      },
    }),
    request.post("/api/v1/uploads/sign", {
      data: {
        filename: "protocol.txt",
        mimeType: "text/plain",
        byteSize: 128,
      },
    }),
    request.post("/api/v1/uploads/parse", {
      data: {
        objectKey: "organizations/e2e/protocol.txt",
        filename: "protocol.txt",
        mimeType: "text/plain",
      },
    }),
  ];

  for (const response of await Promise.all(mutations)) {
    await expectUnauthenticatedProblem(response);
  }
});

test("live extraction requires sign-in before an anonymous mutation", async ({
  page,
}) => {
  await page.goto("/app/review");

  await expect(
    page.getByRole("heading", { name: "Extract claims from a real source" }),
  ).toBeVisible();
  await expect(page.getByLabel("Protocol text")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Run live extraction" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Sign in to run extraction" }),
  ).toHaveAttribute("href", "/sign-in?returnTo=/app/review");
  await expect(page.getByText(/Live claims, verified quotes/)).toBeVisible();
});

test("liveness and readiness report distinct operational semantics", async ({
  request,
}) => {
  const health = await request.get("/api/v1/health");
  expect(health.status()).toBe(200);
  expect(health.headers()["cache-control"]).toBe("no-store");
  expect(health.headers()["x-request-id"]).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    service: "supersede-web",
    configuration: {
      database: expect.any(Boolean),
      workos: expect.any(Boolean),
      openai: expect.any(Boolean),
      workingStorage: expect.any(Boolean),
      inngest: expect.any(Boolean),
    },
  });

  const readiness = await request.get("/api/v1/readiness");
  const body = (await readiness.json()) as {
    status: "ready" | "not_ready";
    service: string;
    checks: Record<string, boolean>;
  };
  const allReady = Object.values(body.checks).every(Boolean);

  expect(readiness.status()).toBe(allReady ? 200 : 503);
  expect(readiness.headers()["cache-control"]).toBe("no-store");
  expect(readiness.headers()["x-request-id"]).toBeTruthy();
  expect(body).toMatchObject({
    status: allReady ? "ready" : "not_ready",
    service: "supersede-web",
    checks: {
      database: expect.any(Boolean),
      workos: expect.any(Boolean),
      openai: expect.any(Boolean),
      workingStorage: expect.any(Boolean),
      inngest: expect.any(Boolean),
    },
  });
});

test("five-minute seeded path preserves evidence from review through audit", async ({
  page,
}) => {
  await page.goto("/app/walkthrough");
  await page
    .locator("main")
    .getByRole("link", { name: /Claim review/ })
    .click();

  await expect(page).toHaveURL(/\/app\/review$/);
  await expect(page.getByText("Extracted source citations.")).toBeVisible();
  await expect(page.getByText("Governed workflow")).toBeVisible();

  await clickProductLink(page, "Change events");
  await expect(page).toHaveURL(/\/app\/changes$/);
  await expect(page.getByText("Old rule (from)")).toBeVisible();
  await expect(page.getByText("New rule (to)")).toBeVisible();
  await expect(page.getByText("Validated by")).toBeVisible();

  await page.getByRole("link", { name: "View blast radius" }).click();
  await expect(page).toHaveURL(/\/app\/blast-radius$/);
  await expect(page.getByText("Rewrite required").first()).toBeVisible();
  await expect(page.getByText("Selected path")).toBeVisible();

  await page.getByRole("link", { name: "View divergence cases" }).click();
  await expect(page).toHaveURL(/\/app\/cases$/);
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await expect(page.getByText(/Approval invariant/)).toBeVisible();

  await page.getByRole("link", { name: "Open probes" }).click();
  await expect(page).toHaveURL(/\/app\/probes$/);
  await expect(page.getByText("Governed probe assignments")).toBeVisible();
  await expect(page.getByText(/Answered old/).first()).toBeVisible();
  await expect(page.getByText("different approved case")).toBeVisible();

  await page.getByRole("link", { name: "View audit" }).click();
  await expect(page).toHaveURL(/\/app\/audit$/);
  await expect(page.getByText("Append-only log")).toBeVisible();
  await expect(page.getByText(/SHA-256/)).toBeVisible();
  await expect(
    page.getByText("Governed approvals", { exact: true }),
  ).toBeVisible();
});

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter(
          (element) =>
            element.getBoundingClientRect().right > root.clientWidth + 1,
        )
        .slice(0, 5)
        .map(
          (element) => `${element.tagName.toLowerCase()}.${element.className}`,
        ),
    };
  });

  expect(
    overflow.scrollWidth,
    `Horizontal overflow from: ${overflow.offenders.join(", ")}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function expectUnauthenticatedProblem(response: APIResponse) {
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain(
    "application/problem+json",
  );
  expect(response.headers()["x-request-id"]).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({
    status: 401,
    code: "UNAUTHENTICATED",
    title: "Authentication is required.",
    requestId: expect.any(String),
  });
}

async function clickProductLink(page: Page, name: string) {
  const visibleLink = page
    .getByRole("link", { name, exact: true })
    .filter({ visible: true });

  if ((await visibleLink.count()) === 0) {
    await page.getByRole("button", { name: "More sections" }).click();
  }

  await visibleLink.click();
}

function formatViolations(
  violations: Array<{
    id: string;
    help: string;
    nodes: Array<{ target: unknown }>;
  }>,
) {
  return violations
    .map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes
          .map((node) => String(node.target))
          .join(", ")})`,
    )
    .join("\n");
}
