import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public scaffold and health endpoint are available", async ({
  page,
  request,
}) => {
  const pageResponse = await page.goto("/");

  expect(pageResponse?.headers()["content-security-policy"]).toContain(
    "default-src 'self'",
  );

  await expect(
    page.getByRole("heading", {
      name: "Version control for governed organizational decisions.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open workspace" }).first(),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const response = await request.get("/api/v1/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    service: "supersede-web",
  });
});
