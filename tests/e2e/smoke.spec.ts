import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIResponse, type Page } from "@playwright/test";

const publicRoutes = [
  ["/", "When the rule changes, show what changed with it."],
  ["/app", "Control room"],
  ["/app/review", "Evidence intake"],
  ["/app/graph", "Dependency map"],
  ["/app/changes", "Source change"],
  ["/app/blast-radius", "Impact review"],
  ["/app/cases", "Decision cases"],
  ["/app/probes", "Remediation"],
  ["/app/audit", "Audit trail"],
  ["/app/walkthrough", "Demo guide"],
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

  await expect(page.getByText("Public demo record")).toBeVisible();
  await expect(
    page.getByText(
      /Fictional clinical content · No mutations · No real people/i,
    ),
  ).toBeVisible();
  await expect(page.getByText("Follow the working order")).toBeVisible();
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
    page.getByRole("heading", { name: "Add a source to the record" }),
  ).toBeVisible();
  await expect(page.getByLabel("Source text")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Extract claims" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Sign in to continue" }),
  ).toHaveAttribute("href", "/sign-in?returnTo=/app/review");
  await expect(
    page.getByText(/quote-matched claims enter the governed queue/i),
  ).toBeVisible();
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
    .getByRole("link", { name: /Begin at evidence intake/ })
    .click();

  await expect(page).toHaveURL(/\/app\/review$/);
  await expect(page.getByText("Claims on record")).toBeVisible();
  await expect(page.getByText("Evidence passage").first()).toBeVisible();
  await expect(page.getByText("Review priority signal").first()).toBeVisible();

  await clickProductLink(page, "Source change");
  await expect(page).toHaveURL(/\/app\/changes$/);
  await expect(page.getByText("Old rule")).toBeVisible();
  await expect(page.getByText("New rule")).toBeVisible();
  await expect(page.getByText("Governance record")).toBeVisible();

  await clickProductLink(page, "Dependency map");
  await expect(page).toHaveURL(/\/app\/graph$/);
  await expect(
    page
      .getByLabel("Find a record in the dependency path")
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Selected record").filter({ visible: true }),
  ).toBeVisible();

  await clickProductLink(page, "Impact review");
  await expect(page).toHaveURL(/\/app\/blast-radius$/);
  await expect(page.getByText("Owner triage ledger")).toBeVisible();
  await expect(
    page.getByText(/potentially exposed people/i).first(),
  ).toBeVisible();

  await clickProductLink(page, "Decision cases");
  await expect(page).toHaveURL(/\/app\/cases$/);
  await expect(page.getByText("Old rule outcome").first()).toBeVisible();
  await expect(page.getByText("New rule outcome").first()).toBeVisible();
  await expect(
    page.getByText("Approval and version lock").first(),
  ).toBeVisible();

  await clickProductLink(page, "Remediation");
  await expect(page).toHaveURL(/\/app\/probes$/);
  await expect(
    page.getByRole("heading", { name: "Assignment queue", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Closure sequence", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/different approved case/i).first(),
  ).toBeVisible();

  await clickProductLink(page, "Audit trail");
  await expect(page).toHaveURL(/\/app\/audit$/);
  await expect(
    page.getByRole("heading", { name: "Append-only events", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/SHA-256 checksum/)).toBeVisible();
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
  let visibleLink = page
    .getByRole("link", { name, exact: true })
    .filter({ visible: true });

  if ((await visibleLink.count()) === 0) {
    await page
      .getByRole("button", { name: "Open workflow navigation" })
      .click();
    visibleLink = page.getByRole("dialog").getByRole("link", { name });
    await expect(visibleLink).toBeVisible();
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
