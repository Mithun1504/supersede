import { readFileSync } from "node:fs";

import { expect, test, type Browser } from "@playwright/test";
import { Pool } from "pg";

const authSecret = process.env.E2E_AUTH_SECRET ?? "supersede-e2e-local-secret";
const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3119"}`;

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("DATABASE_URL="));
  return line?.slice("DATABASE_URL=".length);
}

async function actorPage(
  browser: Browser,
  input: { user: string; name: string },
) {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-supersede-e2e-key": authSecret,
      "x-supersede-e2e-user": input.user,
      "x-supersede-e2e-organization": "org_demo_supersede",
      "x-supersede-e2e-name": input.name,
    },
  });
  return { context, page: await context.newPage() };
}

test.describe.serial("authenticated governed journey", () => {
  test("browser mutations persist the complete governed workflow", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(testInfo.project.name !== "chromium");
    const connectionString = databaseUrl();
    test.skip(!connectionString, "DATABASE_URL is required for DB assertions.");
    const pool = new Pool({ connectionString });
    const seed = await pool.query<{
      change_event_id: string;
      change_event_version_id: string;
      old_source_version_id: string;
      new_source_version_id: string;
    }>(`
      select ce.id as change_event_id, cev.id as change_event_version_id,
        cev.old_source_version_id, cev.new_source_version_id
      from change_event ce join change_event_version cev on cev.change_event_id = ce.id
      join organization o on o.id = ce.organization_id
      where o.workos_organization_id = 'org_demo_supersede'
      order by ce.validated_at desc nulls last limit 1
    `);
    const active = seed.rows[0];
    expect(active).toBeTruthy();
    const journey = `e2e-${Date.now()}`;
    const edgeFixture = await pool.query<{
      edge_id: string;
      edge_version_id: string;
    }>(
      `insert into dependency_edge_version (
         organization_id, edge_id, version_label,
         evidence_document_version_id, evidence_quote,
         evidence_start_offset, evidence_end_offset, evidence_checksum,
         confidence, review_status
       )
       select organization_id, edge_id, $1,
         evidence_document_version_id, evidence_quote,
         evidence_start_offset, evidence_end_offset, evidence_checksum,
         confidence, 'suggested'
       from dependency_edge_version
       where review_status = 'reviewed'
       order by created_at desc
       limit 1
       returning edge_id, id as edge_version_id`,
      [`${journey}-edge`],
    );
    expect(edgeFixture.rows[0]).toBeTruthy();
    const owner = await actorPage(browser, {
      user: "user_demo_change-owner",
      name: "Mina Shah",
    });
    await owner.page.goto(`${appOrigin}/app/cases`);
    const created: Array<{ caseId: string; caseVersionId: string }> = [];
    for (const marker of [60, 61, 62]) {
      await owner.page.getByLabel("Version label").fill(`${journey}-${marker}`);
      await owner.page
        .getByLabel("Clinical scenario")
        .fill(
          `${journey}: A patient has a fictional coagulation marker of ${marker} and no exclusions.`,
        );
      await owner.page
        .getByLabel("Old-rule answer")
        .fill("Start anticoagulation.");
      await owner.page
        .getByLabel("New-rule answer")
        .fill("Hold anticoagulation.");
      await owner.page.getByLabel("Exact old-source quote").fill("at least 52");
      await owner.page.getByLabel("Exact new-source quote").fill("at least 68");
      await owner.page
        .getByLabel("Decision rationale")
        .fill(`${marker} is above 52 and below 68.`);
      await owner.page
        .getByRole("button", { name: "Draft decision case" })
        .click();
      await expect(
        owner.page
          .locator("article")
          .filter({ hasText: `${journey}-${marker}` }),
      ).toBeVisible();
      const persistedCase = await pool.query<{
        case_id: string;
        case_version_id: string;
      }>(
        `select dc.id as case_id, dcv.id as case_version_id
         from divergence_case dc
         join divergence_case_version dcv on dcv.case_id = dc.id
         where dcv.version_label = $1`,
        [`${journey}-${marker}`],
      );
      created.push({
        caseId: persistedCase.rows[0]!.case_id,
        caseVersionId: persistedCase.rows[0]!.case_version_id,
      });
    }
    await owner.page.goto(`${appOrigin}/app/blast-radius`);
    const ownerArtifactRow = owner.page
      .locator("li")
      .filter({ hasText: "P-114 Anticoagulation Protocol" });
    await ownerArtifactRow.getByText("Submit correction version").click();
    await ownerArtifactRow
      .getByLabel("Version label")
      .fill(`${journey}-correction`);
    await ownerArtifactRow
      .getByLabel("Corrected content")
      .fill("Hold anticoagulation unless the active marker is at least 68.");
    await ownerArtifactRow
      .getByRole("button", { name: "Create correction" })
      .click();
    await expect(
      ownerArtifactRow.getByText(
        "Correction submitted for independent approval.",
      ),
    ).toBeVisible();
    await owner.context.close();
    expect(created).toHaveLength(3);

    const edgeReviewer = await actorPage(browser, {
      user: "user_demo_edge-reviewer",
      name: "Evelyn Park",
    });
    await edgeReviewer.page.goto(`${appOrigin}/app/graph`);
    await edgeReviewer.page
      .getByRole("button", { name: "Accept reviewed edge" })
      .click();
    await expect
      .poll(async () => {
        const result = await pool.query<{ status: string }>(
          "select review_status as status from dependency_edge_version where id = $1",
          [edgeFixture.rows[0]!.edge_version_id],
        );
        return result.rows[0]?.status;
      })
      .toBe("reviewed");
    await edgeReviewer.page.goto(`${appOrigin}/app/blast-radius`);
    const reviewerArtifactRow = edgeReviewer.page
      .locator("li")
      .filter({ hasText: "P-114 Anticoagulation Protocol" });
    await reviewerArtifactRow
      .getByRole("button", { name: "Confirm correction" })
      .click();
    const approveCorrection = reviewerArtifactRow.getByRole("button", {
      name: "Approve correction",
    });
    await approveCorrection.click();
    await expect
      .poll(async () => {
        const result = await pool.query<{ locked: boolean }>(
          `select locked_at is not null as locked
           from artifact_version
           where version_label = $1`,
          [`${journey}-correction`],
        );
        return result.rows[0]?.locked;
      })
      .toBe(true);
    await edgeReviewer.page.reload();
    await expect(
      reviewerArtifactRow.getByRole("button", {
        name: "Publish approved correction",
      }),
    ).toBeVisible();
    await reviewerArtifactRow
      .getByRole("button", { name: "Publish approved correction" })
      .click();
    await expect
      .poll(async () => {
        const result = await pool.query<{ published: boolean }>(
          `select exists(
             select 1
             from artifact_version av
             join audit_event ae
               on ae.object_version_id = av.id
              and ae.event_type = 'artifact.version_published'
             where av.version_label = $1
           ) as published`,
          [`${journey}-correction`],
        );
        return result.rows[0]?.published;
      })
      .toBe(true);
    await edgeReviewer.page.reload();
    await expect(reviewerArtifactRow.getByText("Published")).toBeVisible();
    await edgeReviewer.context.close();

    const approved = created[0]!;
    const approver = await actorPage(browser, {
      user: "user_demo_case-approver",
      name: "Irene Holt",
    });
    await approver.page.goto(`${appOrigin}/app/cases`);
    for (const marker of [60, 61, 62]) {
      const caseCard = approver.page
        .locator("article")
        .filter({ hasText: `${journey}-${marker}` });
      await caseCard.getByRole("button", { name: "Approve and lock" }).click();
      await expect(caseCard.getByText("Approved and locked")).toBeVisible();
    }
    await approver.context.close();

    const releaser = await actorPage(browser, {
      user: "user_demo_release",
      name: "Sam Reyes",
    });
    await releaser.page.goto(`${appOrigin}/app/cases`);
    const approvedCard = releaser.page
      .locator("article")
      .filter({ hasText: `${journey}-60` });
    const releaseButton = approvedCard.getByRole("button", {
      name: "Release to probes",
    });
    await releaseButton.click();
    await expect
      .poll(async () => {
        const result = await pool.query<{ count: string }>(
          "select count(*)::text as count from probe_assignment where case_version_id = $1",
          [approved.caseVersionId],
        );
        return result.rows[0]?.count;
      })
      .toBe("8");
    await releaser.context.close();

    const learner = await actorPage(browser, {
      user: "user_demo_learner-adams",
      name: "R.N. Adams",
    });
    await learner.page.goto(`${appOrigin}/app/probes`);
    await learner.page
      .getByPlaceholder("Search person, role, or scenario")
      .fill(journey);
    const openAssignment = learner.page
      .getByRole("button")
      .filter({ hasText: "R.N. Adams" })
      .filter({ hasText: journey })
      .first();
    await openAssignment.click();
    await learner.page
      .getByLabel("Your response")
      .fill("Start anticoagulation.");
    await learner.page.getByRole("button", { name: "Submit response" }).click();
    await expect(learner.page.getByLabel("Correction")).toBeVisible();
    await learner.page
      .getByLabel("Correction")
      .fill("Use the current threshold of 68.");
    await learner.page
      .getByLabel("Reviewer feedback")
      .fill("Exact current-rule correction recorded.");
    await learner.page
      .getByRole("button", { name: "Complete remediation" })
      .click();
    await expect(
      learner.page.getByRole("button", { name: "Complete remediation" }),
    ).toBeHidden();
    await learner.context.close();

    const persisted = await pool.query<{
      passed: boolean;
      rechecks: string;
      different_cases: string;
    }>(
      `select ra.status = 'passed' as passed,
        count(distinct r.id)::text as rechecks,
        count(distinct r.case_version_id) filter (where r.case_version_id <> pa.case_version_id)::text as different_cases
      from probe_assignment pa
      join person p on p.id = pa.person_id and p.external_key = 'rn-adams'
      join probe_response pr on pr.assignment_id = pa.id
      join remediation_assignment ra on ra.probe_response_id = pr.id
      left join recheck_assignment r on r.person_id = pa.person_id
        and r.change_event_version_id = pa.change_event_version_id
        and r.created_at >= ra.completed_at
      where pa.case_version_id = $1
      group by ra.id, pa.case_version_id`,
      [approved.caseVersionId],
    );
    expect(persisted.rows[0]).toMatchObject({
      passed: true,
      rechecks: "2",
    });
    expect(Number(persisted.rows[0]?.different_cases)).toBeGreaterThan(0);

    const changeOwner = await actorPage(browser, {
      user: "user_demo_change-owner",
      name: "Mina Shah",
    });
    await changeOwner.page.goto(`${appOrigin}/app/changes`);
    await changeOwner.page
      .getByLabel("Version label")
      .fill(`${journey}-change`);
    await changeOwner.page
      .getByLabel("Affected population")
      .fill("Fictional adult inpatient population");
    await changeOwner.page
      .getByLabel("Retired rule")
      .fill("Escalate when the fictional marker is at least 68.");
    await changeOwner.page
      .getByLabel("Replacement rule")
      .fill("Escalate when the fictional marker is at least 72.");
    await changeOwner.page
      .getByRole("button", { name: "Record source change" })
      .click();
    const changeCard = changeOwner.page
      .locator("article")
      .filter({ hasText: `${journey}-change` });
    await expect(changeCard).toBeVisible();
    const draftedChange = await pool.query<{
      change_id: string;
      version_id: string;
    }>(
      `select ce.id as change_id, cev.id as version_id
       from change_event ce
       join change_event_version cev on cev.change_event_id = ce.id
       where cev.version_label = $1`,
      [`${journey}-change`],
    );
    expect(draftedChange.rows[0]).toBeTruthy();
    await changeOwner.context.close();

    const validator = await actorPage(browser, {
      user: "user_demo_validator",
      name: "Omar Voss",
    });
    await validator.page.goto(`${appOrigin}/app/changes`);
    await validator.page
      .locator("article")
      .filter({ hasText: `${journey}-change` })
      .getByRole("button", { name: "Validate and lock" })
      .click();
    await expect
      .poll(async () => {
        const result = await pool.query<{ validated: boolean }>(
          `select validated_at is not null and locked_at is not null as validated
           from change_event ce
           join change_event_version cev on cev.change_event_id = ce.id
           where cev.id = $1`,
          [draftedChange.rows[0]!.version_id],
        );
        return result.rows[0]?.validated;
      })
      .toBe(true);
    await validator.context.close();

    const auditor = await actorPage(browser, {
      user: "user_demo_auditor",
      name: "Noor Bell",
    });
    await auditor.page.goto(`${appOrigin}/app/audit`);
    await auditor.page
      .getByRole("button", { name: "Generate checksummed bundle" })
      .click();
    await expect
      .poll(async () => {
        const result = await pool.query<{ queued: boolean }>(
          `select exists(
             select 1 from outbox_event
             where event_name = 'report.requested'
               and payload->>'changeEventVersionId' = $1
           ) as queued`,
          [draftedChange.rows[0]!.version_id],
        );
        return result.rows[0]?.queued;
      })
      .toBe(true);
    await auditor.context.close();
    await pool.end();
  });
});
