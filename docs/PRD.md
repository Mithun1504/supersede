# Product requirements

## Summary

Supersede tracks a changed source through every dependent claim, artifact,
decision, remediation, and recheck. It gives reviewers an inspectable evidence
chain and an exportable record of authorized actions.

The hackathon product is **Displace**, a fictional hospital and CME workflow.
**Propagate** is the commercial artifact-governance configuration.

## Users

| Configuration | Buyer and user | Scope |
| --- | --- | --- |
| Propagate | Pharma medical affairs and promotional review teams | Sources, claims, artifacts, changes, remediation, audit |
| Displace | Hospital CME and quality teams; assessed professionals | Propagate scope plus role exposure, decision cases, probes, remediation, and rechecks |

Learner work must be short, specific, mobile-friendly, and dignified.

## Product rules

1. AI proposes and prioritizes. Authenticated people authorize.
2. Every claim and dependency keeps its exact source evidence and provenance.
3. Approved versions are immutable.
4. Ambiguous results enter review.
5. Reports describe observed actions and responses. They do not claim to measure belief, knowledge, or competence.
6. Propagate tenants cannot access people or learning data.

## Workflow

### 1. Evidence intake

- Accept TXT, Markdown, HTML, DOCX, XLSX, and text-based PDF files.
- Extract claims and source links with exact quotes, locations, confidence, model ID, and prompt version.
- Verify returned quotes against the source.
- Send every extraction to review. Confidence below `0.80` receives priority.

### 2. Source change

- A change owner records the old rule, new rule, affected population, and source versions.
- A different reviewer validates the change before propagation.
- The validated version is locked.

### 3. Dependency review

- Store reviewed, typed dependency edges with evidence and rationale.
- Traverse complete paths safely through cycles, up to eight hops.
- Classify reviewed scores at or above `0.65` as rewrite required by default.
- Record a reason for every reviewer override.

### 4. Impact review

- Separate load-bearing dependencies from peripheral mentions.
- Move affected artifacts through triage, owner assignment, correction, approval, and publication.
- Show potential role and person exposure only in Displace.

### 5. Decision cases

- Generate cases where the old and new rules produce different decisions.
- Store the scenario, both answers, rationale, and citations to both source versions.
- Require expert approval before assignment.
- Retire ambiguous cases. Never patch an approved case in place.

### 6. Probe, remediation, and recheck

- Deliver approved cases cold, without revealing the changed rule.
- Record assignment, open, completion, and response evidence.
- Classify responses as `old`, `new`, or `other` only against the approved case rationale.
- Require `0.80` confidence for `old` or `new`; send other results to review.
- Give an old-rule responder a realistic correction task grounded in the new source.
- Schedule 30-day and 90-day rechecks with a different approved case.
- Keep a recheck blocked until a suitable case exists.

### 7. Audit

- Record every state transition as an append-only audit event.
- Reserve approval records for human authorization.
- Export PDF, JSON, and CSV evidence with a manifest and SHA-256 checksums.
- Label standard object storage accurately. Claim WORM retention only after a successful S3 Object Lock write.

## Authorization

Initial roles:

- organization administrator
- change owner
- change validator
- dependency reviewer
- case author and approver
- release authorizer
- auditor
- learner

Required separation of duties:

- change owner and validator must differ;
- case author and approver must differ;
- case approver and release authorizer must differ.

Every governed write requires an authenticated tenant membership. Product roles
come from PostgreSQL, never from client input or editable identity metadata.

## Reporting and privacy

- Aggregate reporting is the default.
- Cohort breakdowns require at least five people.
- Named results require explicit organization policy. Only the fictional demo tenant enables them.
- All hackathon people, clinical content, responses, and outcomes are fictional.
- Real PHI or employee data requires contractual, privacy, security, retention, and regional review.

## Hackathon slice

The Displace demo uses three protocols, one CME module, one claims sheet, and
eight fictional people across two roles. One anticoagulation rule changes.

The five-minute path must show:

1. live GPT-5.6 extraction of three quote-verified claims;
2. manual change entry and second-person validation;
3. the reviewed path to affected artifacts and six potentially exposed people;
4. three decision cases and one approval;
5. R.N. Adams answering with the old rule, completing correction, and receiving a different-case recheck;
6. the observable audit state and checksummed export.

The corpus and people are seeded and labeled. The source change is manual by
design. Live extraction is a completion gate. Deterministic fallback is only
for tests and disaster recovery.

## Success measures

- Extraction precision and quote validity on the labeled corpus
- Median and p95 reviewer time, with a target below 15 minutes per 50 claims by the third corpus
- Validation-to-impact-report time below one day
- Old-rule response rate on approved, unambiguous cases
- Different-case recheck outcomes at 90 days
- Audit-report acceptance by a compliance reviewer

## Excluded from v1

- Automated source watchers
- Autonomous artifact changes or case release
- General-purpose LMS or course authoring
- Real EHR integration
- Punitive employee scoring
- Claims of regulator certification

## Open decisions

- Pricing unit by configuration
- First source feeds when watchers return
- Scope of learner-facing boundary-case exercises
