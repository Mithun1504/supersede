import { createHash } from "node:crypto";

import { and, count, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import {
  approvalRecords,
  apiRateLimitBuckets,
  artifactVersions,
  artifacts,
  auditEvents,
  changeEventVersions,
  changeEvents,
  changeImpacts,
  claimVersions,
  claims,
  dependencyEdgeVersions,
  dependencyEdges,
  divergenceCaseVersions,
  divergenceCases,
  documentChunks,
  membershipRoles,
  memberships,
  organizationDomainPolicies,
  outboxEvents,
  organizations,
  people,
  professionalRoles,
  probeAssignments,
  probeDeliveryEvents,
  probeResponses,
  recheckAssignments,
  remediationAssignments,
  remediationAttempts,
  reportBundles,
  roleArtifactExposures,
  roles,
  sourceSupportEdges,
  sourceVersions,
  sources,
  workflowRuns,
} from "@/db/schema";

const roleSeed = [
  ["org_admin", "Organization configuration and membership administration"],
  ["change_owner", "Creates and submits source change events"],
  ["change_validator", "Validates a change event created by another actor"],
  ["edge_reviewer", "Reviews extracted dependency edges and evidence"],
  ["case_approver", "Approves an immutable divergence-case version"],
  ["release_authorizer", "Authorizes release to affected users"],
  ["auditor", "Reads audit records and creates permitted exports"],
  ["learner", "Completes assigned probes and remediation exercises"],
] as const;

const actors = [
  ["change-owner", "Mina Shah", "mina@stm.example", "change_owner"],
  ["validator", "Omar Voss", "omar@stm.example", "change_validator"],
  ["edge-reviewer", "Evelyn Park", "evelyn@stm.example", "edge_reviewer"],
  ["case-approver", "Irene Holt", "irene@stm.example", "case_approver"],
  ["release", "Sam Reyes", "sam@stm.example", "release_authorizer"],
  ["auditor", "Noor Bell", "noor@stm.example", "auditor"],
  ["learner-adams", "R.N. Adams", "adams@stm.example", "learner"],
] as const;

const personas = [
  ["rn-adams", "R.N. Adams", "icu_nurse", "old_rule", "learner-adams"],
  ["rn-bose", "R.N. Bose", "icu_nurse", "new_rule", null],
  ["rn-chen", "R.N. Chen", "icu_nurse", "old_rule", null],
  ["rn-diaz", "R.N. Diaz", "icu_nurse", "other_ambiguous", null],
  ["rn-ellis", "R.N. Ellis", "icu_nurse", "new_rule", null],
  ["rn-frost", "R.N. Frost", "icu_nurse", "old_rule", null],
  ["icu-hart", "ICU Dr. Hart", "hospitalist", "new_rule", null],
  ["icu-iyer", "ICU Dr. Iyer", "hospitalist", "old_rule", null],
] as const;

const professionalRoleSeed = [
  ["icu_nurse", "ICU Nurse", "Applies St. Marlowe ICU medication protocols."],
  ["hospitalist", "Hospitalist", "Oversees fictional inpatient decisions."],
] as const;

const walkthroughLockedAt = new Date("2026-07-15T10:02:00.000Z");
const walkthroughDueAt = new Date("2026-07-22T10:02:00.000Z");

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function must<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Failed to seed ${label}.`);
  return value;
}

async function upgradeExistingSeed(
  database: NodePgDatabase<typeof schema>,
  organizationId: string,
  sourceId: string,
) {
  const [activeChange] = await database
    .select({
      changeEventId: changeEvents.id,
      changeEventVersionId: changeEventVersions.id,
      oldSourceVersionId: changeEventVersions.oldSourceVersionId,
      newSourceVersionId: changeEventVersions.newSourceVersionId,
    })
    .from(changeEvents)
    .innerJoin(
      changeEventVersions,
      eq(changeEventVersions.changeEventId, changeEvents.id),
    )
    .where(
      and(
        eq(changeEvents.organizationId, organizationId),
        eq(changeEvents.sourceId, sourceId),
      ),
    )
    .limit(1);
  if (!activeChange) return;
  const [existing] = await database
    .select({ value: count() })
    .from(divergenceCaseVersions)
    .where(
      eq(
        divergenceCaseVersions.changeEventVersionId,
        activeChange.changeEventVersionId,
      ),
    );
  const currentCount = Number(existing?.value ?? 0);
  if (currentCount >= 3) return;
  const actorRows = await database
    .select({ id: memberships.id, workosUserId: memberships.workosUserId })
    .from(memberships)
    .where(eq(memberships.organizationId, organizationId));
  const actorByWorkos = new Map(
    actorRows.map((actor) => [actor.workosUserId, actor.id]),
  );
  const authorId = must(
    actorByWorkos.get("user_demo_change-owner"),
    "existing change owner",
  );
  const templates = [
    {
      scenario:
        "A patient has a fictional coagulation marker of 65 and no exclusions.",
      oldAnswer: "Start anticoagulation.",
      newAnswer: "Hold anticoagulation.",
      rationale:
        "65 remains above the retired threshold and below the current threshold.",
      ambiguityNote: null,
    },
    {
      scenario:
        "A patient has a fictional coagulation marker of 67 with an unresolved exclusion.",
      oldAnswer:
        "Apply the retired threshold only after resolving the exclusion.",
      newAnswer:
        "Hold treatment and resolve the exclusion before reassessment.",
      rationale:
        "The threshold changes the default decision, while the exclusion preserves a visible ambiguity boundary.",
      ambiguityNote:
        "This case is intentionally retained as an adversarial draft and cannot be approved.",
    },
  ];
  for (const template of templates.slice(Math.max(0, currentCount - 1))) {
    const [caseRow] = await database
      .insert(divergenceCases)
      .values({ organizationId, changeEventId: activeChange.changeEventId })
      .returning({ id: divergenceCases.id });
    if (!caseRow) throw new Error("Failed to upgrade decision-case seed.");
    await database.insert(divergenceCaseVersions).values({
      organizationId,
      caseId: caseRow.id,
      changeEventVersionId: activeChange.changeEventVersionId,
      versionLabel: "v1",
      scenario: template.scenario,
      oldAnswer: template.oldAnswer,
      newAnswer: template.newAnswer,
      rationale: template.rationale,
      oldCitation: {
        sourceVersionId: activeChange.oldSourceVersionId,
        quote: "at least 52",
      },
      newCitation: {
        sourceVersionId: activeChange.newSourceVersionId,
        quote: "at least 68",
      },
      ambiguityNote: template.ambiguityNote,
      status: "draft",
      authoredByMembershipId: authorId,
    });
  }
}

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for seeding.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const database = drizzle(pool, { schema });

  await database
    .insert(roles)
    .values(roleSeed.map(([code, description]) => ({ code, description })))
    .onConflictDoNothing();

  const seedMode = process.env.SEED_ORGANIZATION_MODE ?? "public";
  if (seedMode !== "public" && seedMode !== "sandbox") {
    throw new Error(
      "SEED_ORGANIZATION_MODE must be either 'public' or 'sandbox'.",
    );
  }
  const isPublicWalkthrough = seedMode === "public";
  const workosOrganizationId = isPublicWalkthrough
    ? "org_public_supersede"
    : process.env.WORKOS_DEMO_ORGANIZATION_ID?.trim() || "org_demo_supersede";
  const [configuredOrganization] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.workosOrganizationId, workosOrganizationId))
    .limit(1);
  const organizationValues = {
    name: isPublicWalkthrough
      ? "St. Marlowe Medical Center"
      : "St. Marlowe Demo Sandbox",
    workosOrganizationId,
    configuration: "displace" as const,
    individualResultsVisible: true,
    publicWalkthroughEnabled: isPublicWalkthrough,
    walkthroughProvisioningEnabled: !isPublicWalkthrough,
  };
  const [organization] = configuredOrganization
    ? await database
        .update(organizations)
        .set(organizationValues)
        .where(eq(organizations.id, configuredOrganization.id))
        .returning()
    : await database
        .insert(organizations)
        .values(organizationValues)
        .returning();

  if (!organization) throw new Error("Failed to seed organization.");

  const existingSource = await database
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.organizationId, organization.id),
        eq(sources.canonicalKey, "stm-anticoag-threshold"),
      ),
    )
    .limit(1);
  if (existingSource[0]) {
    await upgradeExistingSeed(database, organization.id, existingSource[0].id);
    console.info(
      "St. Marlowe domain seed is present and upgraded to the current scenario.",
    );
    await pool.end();
    return;
  }

  await database
    .insert(organizationDomainPolicies)
    .values({ organizationId: organization.id })
    .onConflictDoNothing();

  const professionalRoleIds = new Map<string, string>();
  for (const [code, displayName, description] of professionalRoleSeed) {
    const [professionalRole] = await database
      .insert(professionalRoles)
      .values({
        organizationId: organization.id,
        code,
        displayName,
        description,
      })
      .onConflictDoUpdate({
        target: [professionalRoles.organizationId, professionalRoles.code],
        set: { displayName, description },
      })
      .returning();

    professionalRoleIds.set(code, must(professionalRole, code).id);
  }

  const actorIds = new Map<string, string>();
  for (const [key, displayName, email, roleCode] of actors) {
    const [membership] = await database
      .insert(memberships)
      .values({
        organizationId: organization.id,
        workosUserId: `user_demo_${key}`,
        displayName,
        email,
        timezone: "America/New_York",
      })
      .onConflictDoUpdate({
        target: [memberships.organizationId, memberships.workosUserId],
        set: { displayName, email, status: "active" },
      })
      .returning();

    if (!membership) throw new Error(`Failed to seed actor ${key}.`);
    actorIds.set(key, membership.id);

    await database
      .insert(membershipRoles)
      .values({
        organizationId: organization.id,
        membershipId: membership.id,
        roleCode,
      })
      .onConflictDoNothing();
  }

  for (const [
    externalKey,
    displayName,
    professionalRoleCode,
    responsePattern,
    membershipKey,
  ] of personas) {
    const membershipId = membershipKey ? actorIds.get(membershipKey) : null;
    await database
      .insert(people)
      .values({
        organizationId: organization.id,
        membershipId,
        externalKey,
        displayName,
        professionalRoleId: professionalRoleIds.get(professionalRoleCode)!,
        isSeededPersona: true,
        responsePattern,
      })
      .onConflictDoUpdate({
        target: [people.organizationId, people.externalKey],
        set: { membershipId, displayName, responsePattern },
      });
  }

  const [source] = await database
    .insert(sources)
    .values({
      organizationId: organization.id,
      kind: "guideline",
      canonicalKey: "stm-anticoag-threshold",
      title: "St. Marlowe Anticoagulation Threshold Guideline",
    })
    .onConflictDoNothing()
    .returning();

  const sourceRow =
    source ??
    (
      await database
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.organizationId, organization.id),
            eq(sources.canonicalKey, "stm-anticoag-threshold"),
          ),
        )
        .limit(1)
    )[0];

  if (!sourceRow) throw new Error("Failed to seed source.");

  const [oldSourceVersion, newSourceVersion] = await database
    .insert(sourceVersions)
    .values([
      {
        organizationId: organization.id,
        sourceId: sourceRow.id,
        versionLabel: "2025 fictional threshold",
        status: "superseded",
        effectiveDate: "2025-01-01",
        fileSha256: sha256("old anticoag threshold"),
        summary: "Treat fictional cohort when marker is at least 52.",
        lockedAt: walkthroughLockedAt,
        lockedByMembershipId: actorIds.get("validator"),
      },
      {
        organizationId: organization.id,
        sourceId: sourceRow.id,
        versionLabel: "2026 fictional threshold",
        status: "active",
        effectiveDate: "2026-07-01",
        fileSha256: sha256("new anticoag threshold"),
        summary: "Hold treatment unless marker is at least 68.",
        lockedAt: walkthroughLockedAt,
        lockedByMembershipId: actorIds.get("validator"),
      },
    ])
    .onConflictDoNothing()
    .returning();

  if (!oldSourceVersion || !newSourceVersion)
    throw new Error("Failed to seed source versions.");

  const ownerId = actorIds.get("change-owner");
  const [protocol, cme, transferProtocol, dosingProtocol, claimSheet] =
    await database
      .insert(artifacts)
      .values([
        {
          organizationId: organization.id,
          kind: "protocol",
          ownerMembershipId: ownerId,
          canonicalKey: "P-114",
          title: "P-114 Anticoagulation Protocol",
        },
        {
          organizationId: organization.id,
          kind: "course",
          ownerMembershipId: ownerId,
          canonicalKey: "CME-AC-7",
          title: "CME Module: Bedside Anticoagulation",
        },
        {
          organizationId: organization.id,
          kind: "protocol",
          ownerMembershipId: ownerId,
          canonicalKey: "P-209",
          title: "P-209 ICU Transfer Checklist",
        },
        {
          organizationId: organization.id,
          kind: "protocol",
          ownerMembershipId: ownerId,
          canonicalKey: "P-331",
          title: "P-331 Dose Hold Protocol",
        },
        {
          organizationId: organization.id,
          kind: "claim_library_entry",
          ownerMembershipId: ownerId,
          canonicalKey: "CL-22",
          title: "Claims Sheet: Anticoagulation Safety",
        },
      ])
      .onConflictDoNothing()
      .returning();

  const protocolRow = must(protocol, "protocol artifact");
  const cmeRow = must(cme, "CME artifact");
  const transferProtocolRow = must(transferProtocol, "transfer protocol");
  const dosingProtocolRow = must(dosingProtocol, "dose hold protocol");
  const claimSheetRow = must(claimSheet, "claim sheet artifact");

  const protocolText =
    "If the fictional coagulation marker is 52 or higher, start anticoagulation unless exclusion criteria apply.";
  const [
    protocolVersion,
    cmeVersion,
    transferProtocolVersion,
    dosingProtocolVersion,
    claimSheetVersion,
  ] = await database
    .insert(artifactVersions)
    .values([
      {
        organizationId: organization.id,
        artifactId: protocolRow.id,
        versionLabel: "v1",
        bodyText: protocolText,
        fileSha256: sha256(protocolText),
        lockedAt: walkthroughLockedAt,
        lockedByMembershipId: actorIds.get("edge-reviewer"),
      },
      {
        organizationId: organization.id,
        artifactId: cmeRow.id,
        versionLabel: "v1",
        bodyText:
          "Remember the older marker threshold during urgent bedside reviews.",
        fileSha256: sha256("cme"),
        lockedAt: walkthroughLockedAt,
        lockedByMembershipId: actorIds.get("edge-reviewer"),
      },
      {
        organizationId: organization.id,
        artifactId: transferProtocolRow.id,
        versionLabel: "v1",
        bodyText:
          "Before ICU transfer, verify whether P-114 anticoagulation criteria still apply.",
        fileSha256: sha256("transfer-protocol"),
        lockedAt: walkthroughLockedAt,
        lockedByMembershipId: actorIds.get("edge-reviewer"),
      },
      {
        organizationId: organization.id,
        artifactId: dosingProtocolRow.id,
        versionLabel: "v1",
        bodyText:
          "Hold anticoagulation if exclusion criteria apply or the active threshold is not met.",
        fileSha256: sha256("dose-hold-protocol"),
        lockedAt: walkthroughLockedAt,
        lockedByMembershipId: actorIds.get("edge-reviewer"),
      },
      {
        organizationId: organization.id,
        artifactId: claimSheetRow.id,
        versionLabel: "v1",
        bodyText:
          "Claim: threshold-based anticoagulation reduces fictional delays.",
        fileSha256: sha256("claim-sheet"),
        lockedAt: walkthroughLockedAt,
        lockedByMembershipId: actorIds.get("edge-reviewer"),
      },
    ])
    .returning();
  const protocolVersionRow = must(protocolVersion, "protocol version");
  const cmeVersionRow = must(cmeVersion, "CME version");
  const transferProtocolVersionRow = must(
    transferProtocolVersion,
    "transfer protocol version",
  );
  const dosingProtocolVersionRow = must(
    dosingProtocolVersion,
    "dose hold protocol version",
  );
  const claimSheetVersionRow = must(claimSheetVersion, "claim sheet version");

  await database.insert(documentChunks).values({
    organizationId: organization.id,
    artifactVersionId: protocolVersionRow.id,
    chunkOrdinal: 1,
    sectionLabel: "Treatment threshold",
    startOffset: 0,
    endOffset: protocolText.length,
    text: protocolText,
    checksum: sha256(protocolText),
    embeddingModel: "gemini-embedding-001",
  });

  const [claim] = await database
    .insert(claims)
    .values({
      organizationId: organization.id,
      artifactVersionId: protocolVersionRow.id,
      canonicalKey: "P-114-threshold-claim",
    })
    .returning();
  const claimRow = must(claim, "claim");

  const [claimVersion] = await database
    .insert(claimVersions)
    .values({
      organizationId: organization.id,
      claimId: claimRow.id,
      versionLabel: "v1",
      text: "Start anticoagulation when the fictional marker is at least 52.",
      evidenceQuote: "fictional coagulation marker is 52 or higher",
      evidenceSection: "Treatment threshold",
      evidenceStartOffset: 7,
      evidenceEndOffset: 49,
      evidenceChecksum: sha256(protocolText),
      extractionRunId: "seed-extraction-001",
      promptVersion: "claim_extraction_v1",
      modelId: "gpt-5.6",
      confidence: "0.920",
      loadBearingScore: "0.880",
      loadBearingRationale: "The protocol action depends on this threshold.",
      reviewStatus: "reviewed",
      reviewedByMembershipId: actorIds.get("edge-reviewer"),
      lockedAt: walkthroughLockedAt,
      lockedByMembershipId: actorIds.get("edge-reviewer"),
    })
    .returning();
  const claimVersionRow = must(claimVersion, "claim version");

  await database.insert(sourceSupportEdges).values({
    organizationId: organization.id,
    claimVersionId: claimVersionRow.id,
    sourceVersionId: oldSourceVersion.id,
  });

  const [edge] = await database
    .insert(dependencyEdges)
    .values({
      organizationId: organization.id,
      kind: "supports",
      fromObjectType: "claim_version",
      fromObjectId: claimVersionRow.id,
      toObjectType: "source_version",
      toObjectId: oldSourceVersion.id,
    })
    .returning();
  const edgeRow = must(edge, "dependency edge");

  const [edgeVersion] = await database
    .insert(dependencyEdgeVersions)
    .values({
      organizationId: organization.id,
      edgeId: edgeRow.id,
      versionLabel: "v1",
      evidenceDocumentVersionId: protocolVersionRow.id,
      evidenceQuote: "marker is 52 or higher",
      evidenceStartOffset: 27,
      evidenceEndOffset: 50,
      evidenceChecksum: sha256(protocolText),
      confidence: "0.910",
      reviewStatus: "reviewed",
      reviewedByMembershipId: actorIds.get("edge-reviewer"),
      lockedAt: walkthroughLockedAt,
      lockedByMembershipId: actorIds.get("edge-reviewer"),
    })
    .returning();
  const edgeVersionRow = must(edgeVersion, "dependency edge version");

  await database.insert(roleArtifactExposures).values([
    {
      organizationId: organization.id,
      professionalRoleId: professionalRoleIds.get("icu_nurse")!,
      artifactVersionId: protocolVersionRow.id,
      rationale: "ICU nurses execute P-114 at the bedside.",
      confidence: "0.950",
    },
    {
      organizationId: organization.id,
      professionalRoleId: professionalRoleIds.get("hospitalist")!,
      artifactVersionId: protocolVersionRow.id,
      rationale: "Hospitalists authorize threshold-based treatment.",
      confidence: "0.890",
    },
    {
      organizationId: organization.id,
      professionalRoleId: professionalRoleIds.get("icu_nurse")!,
      artifactVersionId: cmeVersionRow.id,
      rationale: "ICU nurses are assigned the linked course.",
      confidence: "0.780",
    },
    {
      organizationId: organization.id,
      professionalRoleId: professionalRoleIds.get("hospitalist")!,
      artifactVersionId: transferProtocolVersionRow.id,
      rationale: "Hospitalists use the ICU transfer checklist.",
      confidence: "0.840",
    },
    {
      organizationId: organization.id,
      professionalRoleId: professionalRoleIds.get("icu_nurse")!,
      artifactVersionId: dosingProtocolVersionRow.id,
      rationale: "ICU nurses implement medication holds.",
      confidence: "0.810",
    },
  ]);

  const [change] = await database
    .insert(changeEvents)
    .values({
      organizationId: organization.id,
      sourceId: sourceRow.id,
      enteredByMembershipId: actorIds.get("change-owner")!,
      validatedByMembershipId: actorIds.get("validator"),
      validatedAt: walkthroughLockedAt,
    })
    .returning();
  const changeRow = must(change, "change event");

  const [changeVersion] = await database
    .insert(changeEventVersions)
    .values({
      organizationId: organization.id,
      changeEventId: changeRow.id,
      oldSourceVersionId: oldSourceVersion.id,
      newSourceVersionId: newSourceVersion.id,
      versionLabel: "v1",
      oldRule: "Treat when marker is at least 52.",
      newRule: "Hold treatment unless marker is at least 68.",
      affectedPopulation: "Fictional ICU anticoagulation protocol users.",
      diffSummary: { oldThreshold: 52, newThreshold: 68 },
      lockedAt: walkthroughLockedAt,
      lockedByMembershipId: actorIds.get("validator"),
    })
    .returning();
  const changeVersionRow = must(changeVersion, "change event version");

  await database.insert(changeImpacts).values([
    {
      organizationId: organization.id,
      changeEventVersionId: changeVersionRow.id,
      impactedObjectType: "artifact_version",
      impactedObjectId: protocolVersionRow.id,
      impactKind: "load_bearing",
      pathEdgeIds: [edgeRow.id],
      pathDepth: 1,
      confidence: "0.880",
      rationale: "P-114 embeds the superseded threshold as an action rule.",
      rewriteRequired: "yes",
    },
    {
      organizationId: organization.id,
      changeEventVersionId: changeVersionRow.id,
      impactedObjectType: "artifact_version",
      impactedObjectId: cmeVersionRow.id,
      impactKind: "peripheral",
      pathEdgeIds: [edgeRow.id],
      pathDepth: 1,
      confidence: "0.720",
      rationale:
        "The CME module mentions the old rule without owning the protocol.",
      rewriteRequired: "candidate",
    },
    {
      organizationId: organization.id,
      changeEventVersionId: changeVersionRow.id,
      impactedObjectType: "artifact_version",
      impactedObjectId: transferProtocolVersionRow.id,
      impactKind: "peripheral",
      pathEdgeIds: [edgeRow.id],
      pathDepth: 2,
      confidence: "0.810",
      rationale: "The transfer checklist delegates eligibility to P-114.",
      rewriteRequired: "no",
    },
    {
      organizationId: organization.id,
      changeEventVersionId: changeVersionRow.id,
      impactedObjectType: "artifact_version",
      impactedObjectId: dosingProtocolVersionRow.id,
      impactKind: "load_bearing",
      pathEdgeIds: [edgeRow.id],
      pathDepth: 2,
      confidence: "0.790",
      rationale: "The dose-hold instruction depends on the active threshold.",
      rewriteRequired: "yes",
    },
    {
      organizationId: organization.id,
      changeEventVersionId: changeVersionRow.id,
      impactedObjectType: "artifact_version",
      impactedObjectId: claimSheetVersionRow.id,
      impactKind: "peripheral",
      pathEdgeIds: [edgeRow.id],
      pathDepth: 2,
      confidence: "0.540",
      rationale:
        "The claims sheet may imply the retired threshold and needs review.",
      rewriteRequired: "candidate",
    },
  ]);

  const caseRows = await database
    .insert(divergenceCases)
    .values([
      { organizationId: organization.id, changeEventId: changeRow.id },
      { organizationId: organization.id, changeEventId: changeRow.id },
      { organizationId: organization.id, changeEventId: changeRow.id },
    ])
    .returning();
  const divergenceCaseRow = must(caseRows[0], "primary divergence case");
  const secondDivergenceCaseRow = must(caseRows[1], "second divergence case");
  const thirdDivergenceCaseRow = must(caseRows[2], "third divergence case");

  const caseVersions = await database
    .insert(divergenceCaseVersions)
    .values([
      {
        organizationId: organization.id,
        caseId: divergenceCaseRow.id,
        changeEventVersionId: changeVersionRow.id,
        versionLabel: "v1",
        scenario:
          "A patient has a fictional coagulation marker of 60 and no exclusions.",
        oldAnswer: "Start anticoagulation.",
        newAnswer: "Hold anticoagulation.",
        rationale:
          "60 clears the old 52 threshold but not the new 68 threshold.",
        oldCitation: {
          sourceVersionId: oldSourceVersion.id,
          quote: "at least 52",
        },
        newCitation: {
          sourceVersionId: newSourceVersion.id,
          quote: "at least 68",
        },
        status: "approved",
        authoredByMembershipId: actorIds.get("change-owner")!,
        approvedByMembershipId: actorIds.get("case-approver"),
        approvedAt: walkthroughLockedAt,
        lockedAt: walkthroughLockedAt,
        lockedByMembershipId: actorIds.get("case-approver"),
      },
      {
        organizationId: organization.id,
        caseId: secondDivergenceCaseRow.id,
        changeEventVersionId: changeVersionRow.id,
        versionLabel: "v1",
        scenario:
          "A patient has a fictional coagulation marker of 65 and no exclusions.",
        oldAnswer: "Start anticoagulation.",
        newAnswer: "Hold anticoagulation.",
        rationale:
          "65 remains above the retired threshold and below the current threshold.",
        oldCitation: {
          sourceVersionId: oldSourceVersion.id,
          quote: "at least 52",
        },
        newCitation: {
          sourceVersionId: newSourceVersion.id,
          quote: "at least 68",
        },
        status: "draft",
        authoredByMembershipId: actorIds.get("change-owner")!,
      },
      {
        organizationId: organization.id,
        caseId: thirdDivergenceCaseRow.id,
        changeEventVersionId: changeVersionRow.id,
        versionLabel: "v1",
        scenario:
          "A patient has a fictional coagulation marker of 67 with an unresolved exclusion.",
        oldAnswer:
          "Apply the retired threshold only after resolving the exclusion.",
        newAnswer:
          "Hold treatment and resolve the exclusion before reassessment.",
        rationale:
          "The threshold changes the default decision, while the exclusion preserves a visible ambiguity boundary.",
        oldCitation: {
          sourceVersionId: oldSourceVersion.id,
          quote: "at least 52",
        },
        newCitation: {
          sourceVersionId: newSourceVersion.id,
          quote: "at least 68",
        },
        ambiguityNote:
          "This case is intentionally retained as an adversarial draft and cannot be approved.",
        status: "draft",
        authoredByMembershipId: actorIds.get("change-owner")!,
      },
    ])
    .returning();
  const caseVersionRow = must(
    caseVersions[0],
    "approved divergence case version",
  );

  const seededPeople = await database
    .select()
    .from(people)
    .where(eq(people.organizationId, organization.id));
  const rnAdams = seededPeople.find(
    (person) => person.externalKey === "rn-adams",
  );
  if (!rnAdams) throw new Error("Missing seeded persona R.N. Adams.");

  const [assignment] = await database
    .insert(probeAssignments)
    .values({
      organizationId: organization.id,
      personId: rnAdams.id,
      caseVersionId: caseVersionRow.id,
      changeEventVersionId: changeVersionRow.id,
      assignedByMembershipId: actorIds.get("release"),
      dueAt: walkthroughDueAt,
    })
    .returning();
  const assignmentRow = must(assignment, "probe assignment");

  await database.insert(probeDeliveryEvents).values([
    {
      organizationId: organization.id,
      assignmentId: assignmentRow.id,
      status: "assigned",
      evidence: { channel: "demo" },
    },
    {
      organizationId: organization.id,
      assignmentId: assignmentRow.id,
      status: "opened",
      evidence: { channel: "demo" },
    },
    {
      organizationId: organization.id,
      assignmentId: assignmentRow.id,
      status: "completed",
      evidence: { channel: "demo" },
    },
  ]);

  const [response] = await database
    .insert(probeResponses)
    .values({
      organizationId: organization.id,
      assignmentId: assignmentRow.id,
      answeredWith: "old",
      responseText: "Start anticoagulation.",
      gradingConfidence: "0.940",
      gradingRationale: "The answer matches the old threshold action.",
      gradingEvidenceQuote: "Start anticoagulation.",
      reviewRequired: false,
    })
    .returning();
  const responseRow = must(response, "probe response");

  const [remediation] = await database
    .insert(remediationAssignments)
    .values({
      organizationId: organization.id,
      personId: rnAdams.id,
      probeResponseId: responseRow.id,
      artifactVersionId: protocolVersionRow.id,
      status: "passed",
      completedAt: walkthroughLockedAt,
    })
    .returning();
  const remediationRow = must(remediation, "remediation assignment");

  await database.insert(remediationAttempts).values({
    organizationId: organization.id,
    remediationAssignmentId: remediationRow.id,
    submittedPatch: "Change threshold from 52 to 68.",
    feedback: "Passed; correction cites the locked 2026 source.",
    passed: true,
  });

  await database.insert(recheckAssignments).values({
    organizationId: organization.id,
    personId: rnAdams.id,
    changeEventVersionId: changeVersionRow.id,
    dueOn: "2026-08-14",
    status: "blocked_case_required",
  });

  for (const person of seededPeople.filter((item) => item.id !== rnAdams.id)) {
    const [additionalAssignment] = await database
      .insert(probeAssignments)
      .values({
        organizationId: organization.id,
        personId: person.id,
        caseVersionId: caseVersionRow.id,
        changeEventVersionId: changeVersionRow.id,
        assignedByMembershipId: actorIds.get("release"),
        dueAt: walkthroughDueAt,
      })
      .returning();
    const assignment = must(
      additionalAssignment,
      `probe for ${person.displayName}`,
    );
    await database.insert(probeDeliveryEvents).values({
      organizationId: organization.id,
      assignmentId: assignment.id,
      status: "completed",
      evidence: { channel: "seed", deliveredTo: person.externalKey },
    });
    const answeredWith =
      person.responsePattern === "old_rule"
        ? "old"
        : person.responsePattern === "new_rule"
          ? "new"
          : "other";
    const responseText =
      answeredWith === "old"
        ? "Start anticoagulation."
        : answeredWith === "new"
          ? "Hold anticoagulation until the active threshold is met."
          : "Request specialist review before acting.";
    const [additionalResponse] = await database
      .insert(probeResponses)
      .values({
        organizationId: organization.id,
        assignmentId: assignment.id,
        answeredWith,
        responseText,
        gradingConfidence: answeredWith === "other" ? "0.620" : "0.930",
        gradingRationale: `Response classified against the locked ${changeVersionRow.versionLabel} case.`,
        gradingEvidenceQuote: responseText,
        reviewRequired: answeredWith === "other",
      })
      .returning();
    if (answeredWith === "old") {
      const response = must(
        additionalResponse,
        `response for ${person.displayName}`,
      );
      await database.insert(remediationAssignments).values({
        organizationId: organization.id,
        personId: person.id,
        probeResponseId: response.id,
        artifactVersionId: protocolVersionRow.id,
        status: "assigned",
      });
    }
  }

  await database.insert(approvalRecords).values([
    {
      organizationId: organization.id,
      actorMembershipId: actorIds.get("validator")!,
      actorRoleCode: "change_validator",
      objectType: "change_event",
      objectId: changeRow.id,
      objectVersionId: changeVersionRow.id,
      action: "change_validated",
      createdAt: walkthroughLockedAt,
    },
    {
      organizationId: organization.id,
      actorMembershipId: actorIds.get("edge-reviewer")!,
      actorRoleCode: "edge_reviewer",
      objectType: "dependency_edge",
      objectId: edgeRow.id,
      objectVersionId: edgeVersionRow.id,
      action: "edge_accepted",
      createdAt: walkthroughLockedAt,
    },
    {
      organizationId: organization.id,
      actorMembershipId: actorIds.get("case-approver")!,
      actorRoleCode: "case_approver",
      objectType: "divergence_case",
      objectId: divergenceCaseRow.id,
      objectVersionId: caseVersionRow.id,
      action: "case_approved",
      createdAt: walkthroughLockedAt,
    },
  ]);

  await database.insert(auditEvents).values({
    organizationId: organization.id,
    actorMembershipId: actorIds.get("change-owner"),
    actorRoleCode: "change_owner",
    eventType: "change.submitted",
    objectType: "change_event",
    objectId: changeRow.id,
    objectVersionId: changeVersionRow.id,
    payload: { source: "seed" },
    occurredAt: walkthroughLockedAt,
  });

  await database.insert(auditEvents).values({
    organizationId: organization.id,
    actorMembershipId: actorIds.get("auditor"),
    actorRoleCode: "auditor",
    eventType: "report.generated",
    objectType: "change_event",
    objectId: changeRow.id,
    objectVersionId: changeVersionRow.id,
    payload: { assigned: 1, assessed: 1, remediated: 1, recheck: "scheduled" },
    occurredAt: walkthroughLockedAt,
  });

  await database.insert(reportBundles).values({
    organizationId: organization.id,
    changeEventVersionId: changeVersionRow.id,
    generatedByMembershipId: actorIds.get("auditor")!,
    storageObjectKey: "demo/reports/st-marlowe-anticoagulation.zip",
    sha256: sha256("st-marlowe-report"),
    manifest: {
      artifactVersions: [
        protocolVersionRow.id,
        transferProtocolVersionRow.id,
        dosingProtocolVersionRow.id,
        cmeVersionRow.id,
        claimSheetVersionRow.id,
      ],
    },
    cutoffAt: walkthroughLockedAt,
    lockedAt: walkthroughLockedAt,
    createdAt: walkthroughLockedAt,
  });

  await database.insert(workflowRuns).values({
    organizationId: organization.id,
    externalRunId: "seed-propagation-run",
    workflowName: "change-propagation",
    subjectType: "change_event_version",
    subjectId: changeVersionRow.id,
    status: "completed",
    progressCurrent: 5,
    progressTotal: 5,
    startedAt: walkthroughLockedAt,
    completedAt: walkthroughLockedAt,
  });

  await database.insert(outboxEvents).values({
    organizationId: organization.id,
    eventName: "change.propagation.completed",
    aggregateType: "change_event",
    aggregateId: changeRow.id,
    idempotencyKey: `seed:${changeVersionRow.id}:propagation-completed`,
    payload: { changeEventVersionId: changeVersionRow.id, impactCount: 5 },
    status: "published",
    attempts: 1,
    publishedAt: walkthroughLockedAt,
  });

  await database.insert(apiRateLimitBuckets).values({
    organizationId: organization.id,
    actorMembershipId: actorIds.get("auditor")!,
    scope: "audit-export",
    windowStartedAt: walkthroughLockedAt,
    requestCount: 1,
  });

  await pool.end();
}

seed()
  .then(() => {
    console.info("St. Marlowe domain seed completed.");
  })
  .catch((error: unknown) => {
    console.error("St. Marlowe domain seed failed.", error);
    process.exitCode = 1;
  });
