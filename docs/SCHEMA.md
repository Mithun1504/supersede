# Supersede — Complete Database Schema

**Status:** Target logical schema for full product implementation  
**Authoritative inputs:** [`PRD.md`](./PRD.md), [`TECH_STACK.md`](./TECH_STACK.md), and the existing scaffold  
**Database:** PostgreSQL on Neon with `pgvector`, Drizzle ORM, explicit SQL migrations, and Row Level Security

## 1. Scope and design intent

This schema supports both Supersede configurations without blending their access boundaries:

- **Propagate** governs sources, claims, downstream artifacts, ChangeEvents, blast-radius analysis,
  artifact remediation, approvals, audit history, and exports.
- **Displace** includes every Propagate capability and adds people/work-role exposure mapping,
  divergence cases, probes, artifact-correction exercises, remediation, and different-case 30/90-day
  rechecks.

The schema models observable process facts. It stores that a person was assigned, opened an item,
submitted a response, received an assessment, completed remediation, or was rechecked. It does not
store or infer that a person believes, knows, or is competent in a rule.

The current scaffold contains only the identity and operational foundation tables. This document is
the target schema to be implemented incrementally; it does not imply that the feature tables already
exist.

## 2. Global database conventions

### 2.1 Keys, tenancy, and time

- Primary keys are database-generated UUIDs using `gen_random_uuid()`.
- A concrete `*_id` field is a foreign key to the correspondingly named table unless it is explicitly
  identified as an external provider ID, a polymorphic reference, or a hash. Tenant-owned references
  should use composite `(organization_id, id)` foreign keys or equivalent tenant-equality triggers so
  an ID cannot be attached across organizations.
- Every tenant-owned table carries a non-null `organization_id` even when it can be reached through
  another tenant-owned parent. This makes RLS explicit and prevents accidental cross-tenant joins.
- The intentional exceptions are the `organization` root itself and global catalogs/internal
  identities: `role`, `permission`, `role_permission`, `ai_prompt_version`, and `platform_operator`.
- All timestamps are `timestamptz`, stored in UTC. A user's IANA display timezone is stored on
  `membership` or `person`.
- Mutable operational tables use `created_at` and `updated_at`. Immutable/version and append-only
  tables use `created_at` or a domain-specific event time only.
- User-supplied ordering uses integer `position` fields with `position >= 0`.

### 2.2 Versioning and deletion

- Logical identity tables such as `source`, `artifact`, `claim`, `change_event`, `divergence_case`,
  and `exercise` have immutable version children.
- A new edit inserts a new version with `version_number = previous + 1` and
  `supersedes_*_version_id`; approved versions are never updated in place.
- Version allocation locks the logical parent row (or uses an equivalent advisory lock) before
  computing the next number. The unique `(parent_id, version_number)` constraint remains the final
  race-condition defense.
- Governed records are retired, superseded, revoked, deprovisioned, or disposed under policy. They
  are not soft-deleted with an ambiguous `deleted_at` flag.
- Hard deletion is allowed only through an authorized retention/disposition workflow, after legal
  holds are checked. Approval, audit, delivery, and report-manifest facts are append-only.
- Foreign keys to governed history default to `ON DELETE RESTRICT`. Pure owned staging rows may use
  `ON DELETE CASCADE` only before the parent becomes governed.

### 2.3 Scores, hashes, and sensitive values

- Confidence and load-bearing scores use `numeric(5,4)` with `CHECK (value BETWEEN 0 AND 1)`.
- File and content hashes use lowercase 64-character SHA-256 hex in `char(64)` with a format check.
- Human-readable rationales are stored separately from scores.
- Secrets are never stored directly. Database rows store an encrypted-secret-manager reference or
  a one-way credential hash.
- Raw probe answers and personal identifiers receive the strictest retention class and must not
  appear in logs, telemetry, or error payloads.

### 2.4 RLS and database roles

- RLS is enabled and forced on every tenant-owned table.
- The application sets transaction-local `app.organization_id` and
  `app.actor_membership_id` before tenant queries, as established in the scaffold.
- The application runtime uses a non-owner role. The migration owner, background service role, and
  time-limited support role are separate database roles.
- Background jobs must set an explicit organization context. They do not receive an unrestricted
  cross-tenant query path.
- Propagate policies deny reads and writes to people, case, probe, exercise, and recheck tables even
  when a caller guesses an identifier.

## 3. Enum catalog

The following PostgreSQL enums should be shared rather than recreated as free-form strings.

| Enum                           | Values                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `product_configuration`        | `propagate`, `displace`                                                                                                  |
| `entity_status`                | `active`, `inactive`, `retired`                                                                                          |
| `record_status`                | `draft`, `in_review`, `approved`, `rejected`, `superseded`, `retired`                                                    |
| `membership_status`            | `invited`, `active`, `suspended`, `deprovisioned`                                                                        |
| `person_status`                | `active`, `inactive`, `deprovisioned`                                                                                    |
| `source_kind`                  | `guideline`, `regulation`, `paper`, `standard`, `internal_policy`                                                        |
| `source_version_status`        | `active`, `superseded`, `retracted`, `corrected`                                                                         |
| `artifact_kind`                | `protocol`, `course`, `claim_library_entry`, `decision_doc`, `marketing_material`, `order_set`, `configuration`, `other` |
| `storage_purpose`              | `quarantine`, `working_original`, `derived_text`, `remediation_submission`, `report_bundle`, `report_member`             |
| `scan_status`                  | `pending`, `clean`, `rejected`, `failed`, `not_required_demo`                                                            |
| `processing_status`            | `queued`, `running`, `partial`, `failed`, `completed`, `unsupported`                                                     |
| `evidence_verification_status` | `pending`, `exact`, `fuzzy_verified`, `failed`, `human_verified`                                                         |
| `review_status`                | `suggested`, `needs_review`, `accepted`, `edited`, `rejected`                                                            |
| `review_task_type`             | `claim`, `dependency_edge`, `quote_verification`, `probe_assessment`, `artifact_remediation`, `workflow_failure`         |
| `review_task_status`           | `open`, `assigned`, `in_progress`, `resolved`, `cancelled`                                                               |
| `graph_node_type`              | `source_version`, `artifact_version`, `claim_version`                                                                    |
| `dependency_edge_type`         | `contains`, `supported_by`, `references`, `depends_on`, `informs`                                                        |
| `impact_class`                 | `load_bearing`, `peripheral`, `potential_exposure`, `unreviewed_candidate`                                               |
| `change_event_status`          | `draft`, `submitted`, `validated`, `rejected`, `superseded`, `cancelled`                                                 |
| `case_retirement_reason`       | `ambiguous`, `citation_invalid`, `content_error`, `source_superseded`, `policy_change`, `other`                          |
| `release_status`               | `draft`, `awaiting_authorization`, `authorized`, `releasing`, `released`, `cancelled`, `failed`                          |
| `assignment_status`            | `assigned`, `opened`, `submitted`, `completed`, `expired`, `cancelled`                                                   |
| `answer_format`                | `single_choice`, `multiple_choice`, `free_text`, `artifact_edit`                                                         |
| `assessment_label`             | `old`, `new`, `other`                                                                                                    |
| `assessment_source`            | `deterministic`, `ai`, `human`                                                                                           |
| `artifact_remediation_status`  | `open`, `assigned`, `in_progress`, `submitted`, `needs_review`, `verified`, `rejected`, `cancelled`                      |
| `remediation_status`           | `assigned`, `opened`, `submitted`, `needs_review`, `passed`, `failed`, `cancelled`                                       |
| `recheck_status`               | `scheduled`, `due`, `dispatched`, `completed`, `cancelled`, `blocked_no_case`                                            |
| `delivery_event_type`          | `assigned`, `provider_accepted`, `delivered`, `bounced`, `opened`, `completed`, `failed`                                 |
| `workflow_status`              | `queued`, `running`, `partial`, `failed`, `completed`, `quota_paused`, `cancelled`                                       |
| `outbox_status`                | `pending`, `published`, `failed`                                                                                         |
| `integration_type`             | `workos`, `postmark`, `slack`, `hris_csv`, `lms_xapi`, `lms_scorm`                                                       |
| `connection_status`            | `draft`, `active`, `error`, `disabled`                                                                                   |
| `report_status`                | `requested`, `generating`, `failed`, `completed`, `expired`                                                              |
| `retention_mode`               | `governance`, `compliance`                                                                                               |
| `actor_type`                   | `membership`, `service_account`, `system`, `support_operator`                                                            |

Enums that may grow through customer configuration—permissions, work-role names, event types, and
notification types—remain lookup rows or constrained text instead of PostgreSQL enums.

## 4. Identity, tenancy, and access control

### `organization`

**Purpose:** Tenant root and hard product-configuration boundary.

- `id uuid` PK.
- `workos_organization_id varchar(255)` unique, non-null.
- `name varchar(255)` non-null.
- `product_configuration product_configuration` non-null.
- `status entity_status` non-null, default `active` after the bootstrap transaction.
- `created_at`, `updated_at timestamptz`.
- Indexes: unique WorkOS ID; `(product_configuration, status)` for operations.

One organization owns all tenant data. Changing configuration is privileged, audited, and must run
a compatibility check; a Propagate tenant cannot be changed while Displace data remains accessible.

### `organization_settings`

**Purpose:** One-to-one policy and presentation settings that can change independently of identity.

- `organization_id uuid` PK and FK → `organization.id`.
- `default_timezone varchar(64)`, `locale varchar(16)`.
- `individual_result_policy varchar(32)` constrained to `aggregate_only` or
  `authorized_individual`.
- `minimum_aggregate_cohort_size integer CHECK >= 2`, default `5`.
- `support_access_requires_tenant_approval boolean` default true.
- `review_confidence_threshold numeric(5,4)`.
- `max_graph_depth integer CHECK BETWEEN 1 AND 50`.
- `monthly_ai_budget_minor bigint CHECK >= 0`, `max_upload_bytes bigint CHECK > 0`.
- `created_at`, `updated_at`; `updated_by_membership_id` nullable FK → `membership.id` so the
  bootstrap transaction can create settings before its first membership.

### `membership`

**Purpose:** Internal representation of an authenticated human in one organization.

- `id uuid` PK; `organization_id` FK → `organization.id`.
- `workos_user_id varchar(255)` non-null.
- `email varchar(320)`, `display_name varchar(255)`, `timezone varchar(64)`.
- `status membership_status`.
- `last_authenticated_at timestamptz` nullable; `created_at`, `updated_at`.
- Unique `(organization_id, workos_user_id)`; index `(organization_id, status)`.

A WorkOS user may belong to multiple organizations through separate membership rows. WorkOS owns
sessions; Supersede does not store passwords, MFA secrets, or session cookies.

### `role`

**Purpose:** Tenant authorization roles. Seed the approved codes:
`org_admin`, `change_owner`, `change_validator`, `edge_reviewer`, `case_approver`,
`release_authorizer`, `auditor`, and `learner`.

- `code varchar(64)` PK.
- `description text` non-null; `configuration_scope product_configuration` nullable, where null means
  both configurations.
- `system_defined boolean` default true.

### `permission`

**Purpose:** Stable capabilities checked by service policy rather than scattering role-name checks.

- `code varchar(96)` PK, for example `corpus.write`, `edge.review`, `change.validate`,
  `artifact.remediate_owned`, `case.approve`, `release.prepare`, `release.authorize`,
  `result.read_individual`, `report.export`, `retention.manage`.
- `description text`; `configuration_scope product_configuration` nullable.
- `privileged boolean` identifies permissions requiring recent authentication or MFA.

### `role_permission`

**Purpose:** Many-to-many role-to-permission mapping.

- `role_code` FK → `role.code`; `permission_code` FK → `permission.code`.
- Composite PK `(role_code, permission_code)`.

### `membership_role`

**Purpose:** Auditable many-to-many tenant role assignment.

- `id uuid` PK; `organization_id`; `membership_id` FK → `membership.id`;
  `role_code` FK → `role.code`.
- `granted_by_membership_id` FK → `membership.id`; `granted_at timestamptz`.
- `revoked_by_membership_id`, `revoked_at`, `revocation_reason` nullable.
- Unique partial index `(membership_id, role_code) WHERE revoked_at IS NULL`.
- Trigger verifies all membership references belong to `organization_id`.

Revocation closes the assignment; it does not delete the historical grant.

### `service_account`

**Purpose:** Non-human principal for approved integrations and automation.

- `id uuid` PK; `organization_id`; `name varchar(255)`; `status entity_status`.
- `description text`; `created_by_membership_id`; `last_used_at`; `created_at`, `updated_at`.
- Unique `(organization_id, name)` among non-retired accounts.

Service accounts cannot create `approval_record` rows and cannot receive human separation-of-duties
roles.

### `service_account_permission`

**Purpose:** Least-privilege scopes for a service account.

- `organization_id`; `service_account_id` FK → `service_account.id`;
  `permission_code` FK → `permission.code`.
- `granted_by_membership_id`, `granted_at`, `revoked_at`.
- Composite PK `(service_account_id, permission_code, granted_at)`; partial index for active grants.

### `api_credential`

**Purpose:** Rotatable credentials for service accounts.

- `id uuid` PK; `organization_id`; `service_account_id` FK.
- `key_prefix varchar(16)` for identification; `secret_hash text` non-null.
- `expires_at`, `last_used_at`, `revoked_at`; `created_at`.
- Unique `secret_hash`; index active credentials by `(service_account_id, expires_at)`.

Only the generated secret is shown once; the database stores its hash.

### `platform_operator`

**Purpose:** Internal Supersede operator identity, outside tenant membership and RLS authorization.

- `id uuid` PK; `workos_user_id varchar(255)` unique; `display_name`; `status entity_status`.
- `operator_role varchar(32)` constrained to `support` or `security_admin`.
- `created_at`, `deprovisioned_at`.

There is intentionally no permanent `super_admin` tenant role.

### `support_access_grant`

**Purpose:** Time-limited, purpose-bound access by a platform operator to a tenant.

- `id uuid` PK; `organization_id`; `operator_id` FK → `platform_operator.id`.
- `requested_scope text[]`, `reason text`, `ticket_reference varchar(255)`.
- `approved_by_operator_id` FK, distinct from requester; `starts_at`, `expires_at`.
- `tenant_approved_by_membership_id` nullable FK when customer policy requires consent;
  `emergency_access boolean` default false with `emergency_reason` required when true.
- `revoked_at`, `revoked_by_operator_id`; `created_at`.
- Checks: approver differs from operator, expiry follows start, maximum duration enforced by policy.
- Index `(organization_id, expires_at) WHERE revoked_at IS NULL`.

Emergency access requires the security-admin operator path, a second approver, immediate alerting,
and post-access review. Every use writes an `audit_event`; the grant does not bypass data-class
restrictions silently.
The operator receives no direct tenant-table grant. A narrowly scoped security-definer entry point
validates the active grant and requested permission, sets tenant context, and returns only the
approved operation; its use is covered by dedicated database and penetration tests.

## 5. People, work roles, and cohorts (Displace only)

### `person`

**Purpose:** A professional imported from HRIS/LMS or seeded for the demo, independent of login.

- `id uuid` PK; `organization_id`; `membership_id` nullable unique FK → `membership.id`.
- `external_person_key varchar(255)`; `display_name`, `email` nullable and protected.
- `timezone varchar(64)`; `status person_status`; `is_seeded_persona boolean` default false.
- `source_connection_id` nullable FK → `integration_connection.id`.
- `created_at`, `updated_at`, `deprovisioned_at`.
- Unique `(organization_id, external_person_key)` when present; index `(organization_id, status)`.

An imported person becomes interactive only when linked to an authenticated membership. Seeded
personas must always be visibly marked.

### `work_role`

**Purpose:** Organizational/clinical role used for potential-exposure mapping; it is not an
authorization role.

- `id uuid` PK; `organization_id`; `external_role_key varchar(255)` nullable.
- `name varchar(255)`, `description text`, `status entity_status`.
- `created_at`, `updated_at`.
- Unique `(organization_id, name)` among active roles; optional unique external key.

### `person_work_role`

**Purpose:** Effective-dated many-to-many mapping of people to work roles.

- `id uuid` PK; `organization_id`; `person_id` FK; `work_role_id` FK.
- `effective_from timestamptz`; `effective_to timestamptz` nullable.
- `source_connection_id` nullable; `created_at`.
- Unique partial `(person_id, work_role_id) WHERE effective_to IS NULL`.
- Check `effective_to > effective_from` when present.

### `cohort`

**Purpose:** Named, policy-safe assignment/reporting group without embedding HR attributes into
workflow rows.

- `id uuid` PK; `organization_id`; `name`, `description`; `status entity_status`.
- `created_by_membership_id`; `created_at`, `updated_at`.
- Unique `(organization_id, name)` among active cohorts.

### `cohort_member`

**Purpose:** Many-to-many cohort membership snapshot.

- `organization_id`; `cohort_id` FK → `cohort.id`; `person_id` FK → `person.id`.
- `added_at`; `removed_at` nullable; `added_by_membership_id`.
- Composite PK `(cohort_id, person_id, added_at)`; partial unique active membership.

Aggregate reports must suppress a cohort result below the organization's minimum cohort size.

## 6. Storage, corpus, sources, and artifacts

### `corpus`

**Purpose:** Tenant collection/library that scopes ingestion, review metrics, and retrieval.

- `id uuid` PK; `organization_id`; `name`, `description`; `status entity_status`.
- `created_by_membership_id`; `created_at`, `updated_at`.
- Unique `(organization_id, name)` among non-retired corpora.

### `upload_session`

**Purpose:** Short-lived authorization and validation state for direct upload or pasted content.

- `id uuid` PK; `organization_id`; `requested_by_membership_id`.
- `declared_filename`, `declared_mime_type`, `declared_size bigint`.
- `storage_object_id` nullable FK; `expires_at`; `completed_at`; `status processing_status`.
- `idempotency_key varchar(255)`; `created_at`.
- Unique `(organization_id, idempotency_key)`; index expired incomplete sessions.

### `storage_object`

**Purpose:** Private R2/S3 object metadata and integrity record; object bytes remain outside Postgres.

- `id uuid` PK; `organization_id`; `purpose storage_purpose`.
- `provider varchar(16)` constrained to `r2`, `s3`, or `minio`; `bucket_alias`, `object_key`.
- `sha256 char(64)`, `size_bytes bigint CHECK >= 0`, `mime_type`, `original_filename`.
- `scan_status scan_status`; `encryption_key_reference` nullable.
- `retention_until`, `object_lock_mode retention_mode` nullable; `created_at`.
- Unique `(provider, bucket_alias, object_key)`; indexes `(organization_id, sha256)` and retention due.

Storage paths never leave server-side APIs; clients receive short-lived signed URLs.

### `document_version`

**Purpose:** Immutable parsing/indexing unit shared by source and artifact versions.

- `id uuid` PK; `organization_id`.
- `original_storage_object_id` nullable FK → `storage_object.id` for pasted text.
- `extracted_text_storage_object_id` nullable FK → `storage_object.id`.
- `content_sha256 char(64)`; `detected_mime_type`; `parser_name`, `parser_version`.
- `processing_status`; `parser_manifest jsonb`; `processing_warnings jsonb`.
- `page_count integer`; `language varchar(16)`; `created_by_membership_id`; `created_at`.
- Unique `(organization_id, content_sha256, parser_name, parser_version)` may be used as a cache key,
  but domain versions remain distinct references.
- Index `(organization_id, processing_status, created_at)`.

### `document_chunk`

**Purpose:** Layout-aware lexical and semantic retrieval unit.

- `id uuid` PK; `organization_id`; `document_version_id` FK.
- `position integer`; `content text`; `content_sha256 char(64)`.
- `page_start`, `page_end integer`; `section_path text[]`; `start_offset`, `end_offset integer`.
- `location jsonb` for table/cell or bounding-box metadata.
- `search_vector tsvector`; `embedding vector(768)` nullable.
- `embedding_provider`, `embedding_model`, `embedding_version`; `embedded_at`.
- Unique `(document_version_id, position)`.
- GIN index on `search_vector`; HNSW cosine index on `embedding`; B-tree
  `(organization_id, document_version_id)`.

### `source`

**Purpose:** Stable identity of an authoritative source.

- `id uuid` PK; `organization_id`; `kind source_kind`; `title`.
- `canonical_reference varchar(512)` nullable; `owner_membership_id` nullable.
- `created_at`; `retired_at` nullable.
- Unique `(organization_id, canonical_reference)` when present; title search index.

### `source_version`

**Purpose:** Immutable version of a source of truth.

- `id uuid` PK; `organization_id`; `source_id` FK.
- `version_number integer CHECK > 0`; `version_label varchar(128)`.
- `status source_version_status`; `record_status record_status`.
- `effective_at timestamptz`; `document_version_id` FK.
- `supersedes_source_version_id` nullable self-FK.
- `created_by_membership_id`; `created_at`.
- Unique `(source_id, version_number)` and `(source_id, version_label)`.
- Partial unique index permits at most one approved active version per source.

### `artifact`

**Purpose:** Stable downstream governed artifact identity.

- `id uuid` PK; `organization_id`; `kind artifact_kind`; `title`.
- `external_reference varchar(255)` nullable; `created_at`; `retired_at`.
- Unique `(organization_id, external_reference)` when present; index `(organization_id, kind)`.

### `artifact_version`

**Purpose:** Immutable artifact content version.

- `id uuid` PK; `organization_id`; `artifact_id` FK.
- `version_number integer CHECK > 0`; `version_label`; `record_status`.
- `document_version_id` FK; `effective_at`; `supersedes_artifact_version_id` self-FK.
- `created_by_membership_id`; `created_at`.
- Unique `(artifact_id, version_number)`; partial unique approved-current version.

### `artifact_owner`

**Purpose:** Effective-dated many-to-many ownership for remediation and review routing.

- `id uuid` PK; `organization_id`; `artifact_id` FK; `membership_id` FK.
- `owner_type varchar(32)` constrained to `primary`, `reviewer`, or `steward`.
- `effective_from`, `effective_to`; `created_at`.
- Partial unique `(artifact_id, membership_id, owner_type) WHERE effective_to IS NULL`.

The PRD shorthand names a `Person` owner, but Propagate deliberately has no people layer. Therefore
governance ownership points to an authenticated `membership`; Displace `person` rows remain workforce/
learner identities used for exposure and assignments. A Displace person may optionally link to the
same membership without merging the two concepts.

### `corpus_source`

**Purpose:** Many-to-many inclusion of sources in corpora.

- `organization_id`; `corpus_id` FK; `source_id` FK; `added_at`; `removed_at` nullable.
- Composite PK `(corpus_id, source_id, added_at)`; partial unique active link.

### `corpus_artifact`

**Purpose:** Many-to-many inclusion of artifacts in corpora.

- `organization_id`; `corpus_id` FK; `artifact_id` FK; `added_at`; `removed_at` nullable.
- Composite PK `(corpus_id, artifact_id, added_at)`; partial unique active link.

### `evidence_span`

**Purpose:** Reusable, verifiable citation location for claims, edges, changes, cases, and feedback.

- `id uuid` PK; `organization_id`; `document_version_id` FK;
  `document_chunk_id` nullable FK.
- `exact_quote text`; `page_number integer`; `section_path text[]`.
- `start_offset`, `end_offset integer`; `source_content_sha256 char(64)`.
- `verification_status evidence_verification_status`; `verification_score numeric(5,4)` nullable.
- `verified_by_membership_id` nullable; `verified_at`; `created_at`.
- Check offset order; index `(document_version_id, start_offset, end_offset)`.

The file/chunk checksum makes the citation reproducible even if a later version changes offsets.

## 7. AI provenance, extraction, and human review

### `ai_prompt_version`

**Purpose:** Versioned prompt/schema contract registry shared across tenants.

- `id uuid` PK; `task_type varchar(64)`; `prompt_version varchar(64)`;
  `schema_version varchar(64)`.
- `source_path`, `git_commit_sha char(40)`, `prompt_sha256 char(64)`.
- `status record_status`; `created_at`.
- Unique `(task_type, prompt_version, schema_version)`.

The prompt body remains in source control; the row proves which reviewed contract ran.

### `extraction_run`

**Purpose:** End-to-end parse/embed/extract/review run for a document version.

- `id uuid` PK; `organization_id`; `document_version_id` FK; `corpus_id` nullable FK.
- `workflow_run_id` nullable FK; `status workflow_status`.
- `cache_key char(64)` computed from document hash, parser version, prompt/schema version, resolved
  model, and extraction settings.
- `claims_suggested`, `edges_suggested`, `quotes_failed`, `items_requiring_review integer`.
- `started_at`, `completed_at`; `created_at`.
- Unique `(organization_id, cache_key)` provides extraction idempotency without referencing
  undeclared cache components.

### `ai_model_run`

**Purpose:** Auditable record of one model or embedding call.

- `id uuid` PK; `organization_id`; `workflow_run_id` nullable; `extraction_run_id` nullable.
- `task_type`; `provider`; `model`; `resolved_model`; `ai_prompt_version_id` nullable FK.
- `subject_type varchar(64)`; `subject_id uuid`; `subject_version_id uuid` nullable.
- `application_release_sha char(40)`; `external_response_id`; `reasoning_setting`;
  `status processing_status`.
- `input_tokens`, `output_tokens integer`; `cost_minor bigint`; `latency_ms integer`.
- `validation_outcome`; `output_json jsonb` nullable; `error_code`, `error_summary` nullable.
- `started_at`, `completed_at`, `created_at`.
- Unique `(provider, external_response_id)` when present; indexes by subject/run and cost period.

No hidden chain-of-thought is stored. `output_json` contains only the requested structured result,
inherits the subject's data classification and retention policy, and is encrypted or moved to a
protected storage object when it contains sensitive free text or becomes too large for an ordinary
JSONB row.

### `ai_run_input`

**Purpose:** Normalized provenance for immutable inputs to a model run.

- `organization_id`; `ai_model_run_id` FK; `document_version_id` nullable FK;
  `source_version_id` nullable FK;
  `artifact_version_id` nullable FK.
- `input_role varchar(32)`; `content_sha256 char(64)`; `position integer`.
- PK `(ai_model_run_id, position)`.
- Check that at least one version reference is present and all belong to the same organization.

### `ai_run_retrieval_chunk`

**Purpose:** Exact ordered retrieval set supplied to a model.

- `organization_id`; `ai_model_run_id` FK; `document_chunk_id` FK; `rank integer`.
- `semantic_score`, `lexical_score`, `fused_score numeric(8,6)` nullable.
- PK `(ai_model_run_id, document_chunk_id)`; unique `(ai_model_run_id, rank)`.

### `review_task`

**Purpose:** Unified queue item for ambiguity or human-gated decisions.

- `id uuid` PK; `organization_id`; `task_type review_task_type`; `status review_task_status`.
- `subject_type varchar(64)`; `subject_id uuid`; `subject_version_id uuid` nullable.
- `reason_code`; `priority smallint`; `assigned_to_membership_id` nullable.
- `due_at`; `created_by_workflow_run_id` nullable; `resolved_at`; `created_at`, `updated_at`.
- Unique partial subject key while status is open/in progress.
- Index `(organization_id, status, priority DESC, created_at)` and assignee queue.

The polymorphic subject is deliberate for queue routing; services and database validation triggers
must verify its tenant and supported object type.

### `review_session`

**Purpose:** Measure reviewer effort without collecting intrusive activity telemetry.

- `id uuid` PK; `organization_id`; `membership_id`; `review_task_type`.
- `corpus_id` nullable; `started_at`, `ended_at`; `active_seconds integer CHECK >= 0`.
- `items_reviewed integer CHECK >= 0`; `created_at`.
- Index `(organization_id, corpus_id, started_at)`.

### `review_action`

**Purpose:** Append-only reviewer decision within a session.

- `id uuid` PK; `organization_id`; `review_session_id` FK; `review_task_id` FK.
- `action varchar(32)` constrained to `accepted`, `edited`, `rejected`, `deferred`,
  `human_verified`, or `reclassified`.
- `resulting_version_id uuid` nullable; `reason text` nullable; `created_at`.
- Index by review task and session; no update/delete privilege.

## 8. Claims and dependency graph

### `claim`

**Purpose:** Stable identity of a claim contained in an artifact.

- `id uuid` PK; `organization_id`; `artifact_id` FK; `created_at`; `retired_at`.
- Index `(organization_id, artifact_id)`.

### `claim_version`

**Purpose:** Immutable extracted or reviewer-edited claim version.

- `id uuid` PK; `organization_id`; `claim_id` FK; `artifact_version_id` FK.
- `version_number`; `text`; `normalized_text`; `primary_evidence_span_id` FK.
- `confidence numeric(5,4)`; `load_bearing_score numeric(5,4)`;
  `load_bearing_rationale text`.
- `review_status review_status`; `extraction_run_id` nullable FK;
  `ai_model_run_id` nullable FK.
- `supersedes_claim_version_id` self-FK; `created_by_membership_id` nullable; `created_at`.
- Unique `(claim_id, version_number)`; indexes by artifact version and review queue.

### `graph_node`

**Purpose:** Referentially safe graph endpoint over immutable source, artifact, and claim versions.

- `id uuid` PK; `organization_id`; `node_type graph_node_type`.
- Exactly one of `source_version_id`, `artifact_version_id`, `claim_version_id` is non-null.
- Unique partial index on each non-null version FK; index `(organization_id, node_type)`.
- Trigger verifies `node_type`, selected FK, and tenant agree.

### `dependency_edge`

**Purpose:** Stable identity for a relationship that may receive reviewed versions.

- `id uuid` PK; `organization_id`; `created_at`; `retired_at`.

### `dependency_edge_version`

**Purpose:** Immutable, typed, evidence-backed graph edge.

- `id uuid` PK; `organization_id`; `dependency_edge_id` FK; `version_number`.
- `from_node_id`, `to_node_id` FK → `graph_node.id`; `edge_type dependency_edge_type`.
- `evidence_span_id` FK; `confidence numeric(5,4)`.
- `load_bearing_score numeric(5,4)`; `load_bearing_rationale text`.
- `review_status review_status`; `extraction_run_id`, `ai_model_run_id` nullable.
- `supersedes_edge_version_id` self-FK; `created_by_membership_id`; `created_at`.
- Unique `(dependency_edge_id, version_number)`; check `from_node_id <> to_node_id`.
- Index active traversal directions `(organization_id, from_node_id, edge_type)` and
  `(organization_id, to_node_id, edge_type)`; review queue index.

Recursive traversal uses only accepted/current edge versions by default, tracks visited node IDs,
and applies the organization's maximum depth.

### `role_artifact_exposure`

**Purpose:** Immutable assertion that a work role acts on an artifact, enabling potential-exposure
mapping in Displace.

- `id uuid` PK; `organization_id`; `work_role_id` FK; `artifact_id` FK.
- `evidence_span_id` nullable FK; `confidence numeric(5,4)`; `rationale text`.
- `review_status`; `effective_from`, `effective_to`; `supersedes_exposure_id` nullable self-FK.
- `created_by_membership_id`; `created_at`.
- Partial unique active accepted mapping `(work_role_id, artifact_id)`.

This relation supports “potentially exposed via role”; it never represents a person's knowledge.

## 9. ChangeEvents, propagation, and artifact remediation

### `change_event`

**Purpose:** Stable identity of a manually entered source change.

- `id uuid` PK; `organization_id`; `source_id` FK; `created_at`; `cancelled_at` nullable.
- Index `(organization_id, source_id, created_at DESC)`.

### `change_event_version`

**Purpose:** Immutable draft/validated specification of an old-to-new source change.

- `id uuid` PK; `organization_id`; `change_event_id` FK; `version_number`.
- `old_source_version_id`, `new_source_version_id` FK → `source_version.id`.
- `old_rule text`; `new_rule text`; `affected_population text`; `exclusions text` nullable;
  `unresolved_ambiguity text` nullable; `diff_summary text`.
- `status change_event_status`; `entered_by_membership_id`; `submitted_at` nullable.
- `ai_model_run_id` nullable; `supersedes_change_event_version_id`; `created_at`.
- Unique `(change_event_id, version_number)`; check old and new versions differ.
- Trigger verifies both source versions belong to the event's source and tenant.

Validation requires an append-only `approval_record(action = 'validated')` from a distinct active
`change_validator`. The creator/validator rule is enforced in the service transaction and a
database constraint trigger.

### `change_event_version_citation`

**Purpose:** Exact old/new evidence supporting the structured rule delta on a ChangeEvent version.

- `organization_id`; `change_event_version_id` FK; `citation_side varchar(8)` constrained to `old`
  or `new`.
- `source_version_id` FK; `evidence_span_id` FK; `position integer CHECK >= 0`.
- PK `(change_event_version_id, citation_side, position)`.
- A deferred constraint trigger requires at least one verified citation per side before submission
  and verifies the old side references `old_source_version_id` while the new side references
  `new_source_version_id`.

### `propagation_run`

**Purpose:** Reproducible blast-radius computation for one validated ChangeEvent version.

- `id uuid` PK; `organization_id`; `change_event_version_id` FK; `workflow_run_id` FK.
- `graph_cutoff_at timestamptz`; `algorithm_version varchar(64)`; `max_depth integer`;
  `status workflow_status`.
- `nodes_examined`, `edges_examined`, `impacts_found integer`.
- `started_at`, `completed_at`; `created_at`.
- Unique idempotency key for `(change_event_version_id, graph_cutoff_at, algorithm_version)`.

### `change_impact`

**Purpose:** Persisted, triaged result of a propagation run.

- `id uuid` PK; `organization_id`; `propagation_run_id` FK;
  `change_event_version_id` FK.
- `impact_class impact_class`; `confidence numeric(5,4)`; `rationale text`.
- Exactly one target FK: `claim_version_id`, `artifact_version_id`, `work_role_id`, or `person_id`.
- `requires_remediation boolean`; `review_status`; `created_at`.
- Unique target within a propagation run; indexes by impact class and target.
- Propagate configuration rejects work-role/person targets.

### `change_impact_path`

**Purpose:** One complete explainable graph path supporting an impact.

- `id uuid` PK; `organization_id`; `change_impact_id` FK; `path_rank integer`.
- `path_confidence numeric(5,4)`; `created_at`.
- Unique `(change_impact_id, path_rank)`.

### `change_impact_path_step`

**Purpose:** Ordered nodes/edges in an impact path.

- `organization_id`; `change_impact_path_id` FK; `position integer`; `graph_node_id` FK;
  `dependency_edge_version_id` nullable FK for the edge leading to this node.
- PK `(change_impact_path_id, position)`.

### `artifact_remediation`

**Purpose:** Governed update task for an impacted artifact in both configurations.

- `id uuid` PK; `organization_id`; `change_impact_id` FK restricted to artifact impact.
- `artifact_id`, `impacted_artifact_version_id` FKs; `assigned_to_membership_id` nullable.
- `required_action varchar(32)` constrained to `rewrite`, `line_edit`, `review_only`, or `retire`.
- `status artifact_remediation_status`; `due_at`; `resolved_artifact_version_id` nullable FK.
- `verified_by_membership_id`, `verified_at`; `created_at`, `updated_at`.
- Unique `(change_impact_id, artifact_id)`; index owner/status/due date.

The resolving artifact version must supersede the impacted version. Completion and verification
write audit/approval records in the same transaction. If the organization's approval policy requires
separate release authorization, the resolved version does not become the approved current artifact
version until an eligible actor records `artifact_release_authorized`; this is Propagate's governed
release and does not use a Displace `release_batch`.

## 10. Divergence cases and release authorization (Displace only)

### `divergence`

**Purpose:** Stable rule-delta grouping under which multiple distinct cases and exercises can exist.

- `id uuid` PK; `organization_id`; `change_event_version_id` FK.
- `old_rule text`; `new_rule text`; `affected_population text`; `status record_status`.
- `created_by_membership_id` nullable; `ai_model_run_id` nullable; `created_at`.
- Index `(organization_id, change_event_version_id, status)`.

This parent is required to enforce “different approved case from the same divergence” for rechecks.

### `divergence_case`

**Purpose:** Stable identity of one scenario belonging to a divergence.

- `id uuid` PK; `organization_id`; `divergence_id` FK; `created_at`.

### `divergence_case_version`

**Purpose:** Immutable scenario, expected answers, rationale, and grading rubric.

- `id uuid` PK; `organization_id`; `divergence_case_id` FK; `version_number`.
- `scenario text`; `answer_format answer_format`; `options jsonb` nullable.
- `old_answer text`; `new_answer text`; `rationale text`; `grading_rubric jsonb`.
- `record_status`; `ai_model_run_id` nullable; `supersedes_case_version_id` self-FK.
- `created_by_membership_id` nullable; `created_at`.
- Unique `(divergence_case_id, version_number)`; approved versions are immutable.

### `case_version_citation`

**Purpose:** Mandatory old/new evidence for an exact case version.

- `organization_id`; `case_version_id` FK; `citation_side varchar(8)` constrained to `old` or `new`.
- `source_version_id` FK; `evidence_span_id` FK; `position integer`.
- PK `(case_version_id, citation_side, position)`.
- Each approvable case version must have at least one verified citation on each side.

### `case_retirement`

**Purpose:** Append-only retirement/ambiguity decision without mutating an approved case version.

- `id uuid` PK; `organization_id`; `case_version_id` FK unique.
- `reason case_retirement_reason`; `excludes_historical_metrics boolean`.
- `rationale text`; `retired_by_membership_id`; `retired_at`.
- `approval_record_id` FK unique.

If ambiguity is discovered post hoc, `excludes_historical_metrics = true`; dashboards recalculate
without deleting historical assignments or responses.

### `release_batch`

**Purpose:** Separately authorized release of approved content to a snapshotted audience.

- `id uuid` PK; `organization_id`; `change_event_version_id` FK.
- `status release_status`; `requested_by_membership_id`; `requested_at`.
- `resolved_person_count integer`; `resolved_person_ids_hash char(64)` nullable until the audience is
  resolved.
- `authorized_at`, `released_at`; `idempotency_key`; `created_at`, `updated_at`.
- Unique `(organization_id, idempotency_key)`; status index.

Authorization is represented by `approval_record(action = 'release_authorized')`; the requester and
authorizer may be required to differ by `approval_policy`.

### `release_case`

**Purpose:** Exact approved case versions included in a release.

- `organization_id`; `release_batch_id` FK; `case_version_id` FK.
- PK `(release_batch_id, case_version_id)`.
- Trigger rejects unapproved or retired case versions.

### `release_exercise`

**Purpose:** Exact approved correction-exercise versions authorized with a release.

- `organization_id`; `release_batch_id` FK; `exercise_version_id` FK.
- PK `(release_batch_id, exercise_version_id)`.
- Trigger rejects unapproved/retired versions and requires the exercise divergence to belong to the
  release's ChangeEvent version.

At least one eligible exercise version is required for every released divergence that can produce an
old-rule assessment. This prevents post-release AI output from becoming learner-facing remediation
without human approval and release authorization.

### `release_target`

**Purpose:** Immutable audience snapshot used to create assignments reproducibly.

- `id uuid` PK; `organization_id`; `release_batch_id` FK.
- Exactly one of `person_id`, `work_role_id`, or `cohort_id` is non-null.
- `resolved_person_count integer`; `resolved_person_ids_hash char(64)`; `created_at`.
- Unique target per release.

### `release_target_person`

**Purpose:** Immutable resolved person membership for each release target, preserving the audience
behind the count and hash.

- `organization_id`; `release_batch_id` FK; `release_target_id` FK; `person_id` FK.
- `resolved_via varchar(16)` constrained to `direct`, `work_role`, or `cohort`; `resolved_at`.
- PK `(release_target_id, person_id)`; index `(release_batch_id, person_id)`.
- A trigger verifies target, release, person, and organization agree.

The release workflow resolves roles/cohorts into `release_target_person` rows before authorization,
computes per-target and de-duplicated batch hashes from sorted person IDs, and then creates
idempotent assignments. Future HRIS changes do not rewrite the historical audience.

## 11. Probes, assessment, remediation, and rechecks (Displace only)

### `probe_assignment`

**Purpose:** One cold probe assigned to one person using one approved case version.

- `id uuid` PK; `organization_id`; `person_id` FK; `case_version_id` FK;
  `divergence_id` FK; `change_event_version_id` FK.
- `release_batch_id` nullable FK; `recheck_assignment_id` nullable FK with a partial unique index.
- `assignment_kind varchar(16)` constrained to `initial`, `recheck_30`, or `recheck_90`.
- `status assignment_status`; `assigned_at`; `due_at`; `opened_at`, `completed_at` nullable.
- `created_at`; unique domain idempotency key.
- Index `(person_id, status, due_at)` and `(change_event_version_id, status)`.

Case, divergence, and ChangeEvent references must agree. A retired case cannot receive new
assignments.

### `probe_delivery_event`

**Purpose:** Append-only evidence of assignment and channel delivery lifecycle.

- `id uuid` PK; `organization_id`; `probe_assignment_id` FK.
- `event_type delivery_event_type`; `channel varchar(16)` constrained to `in_app`, `email`,
  `slack`, `lms`, or `simulated`.
- `provider_event_id` nullable; `provider_timestamp`; `metadata jsonb`; `occurred_at`.
- Unique `(channel, provider_event_id)` when present; timeline index.

Email-open evidence is retained as a distinct unreliable signal and never implies completion.

### `probe_response`

**Purpose:** Immutable raw response submission.

- `id uuid` PK; `organization_id`; `probe_assignment_id` FK unique.
- `answer_format`; `selected_option_ids jsonb` nullable; `free_text_ciphertext text` nullable.
- `submitted_at`; `client_submission_id varchar(255)`.
- `content_sha256 char(64)`; `created_at`.
- Unique `(organization_id, client_submission_id)`.
- A check constraint requires the payload shape appropriate to `answer_format`: choice formats use
  option IDs, free text uses ciphertext, and both cannot be populated together.

### `probe_assessment`

**Purpose:** Versioned classification of a response as old/new/other with provenance.

- `id uuid` PK; `organization_id`; `probe_response_id` FK; `revision integer`.
- `label assessment_label`; `source assessment_source`; `confidence numeric(5,4)` nullable.
- `matched_rationale text`; `ambiguity_reason text` nullable.
- `ai_model_run_id` nullable; `assessed_by_membership_id` nullable.
- `supersedes_probe_assessment_id` nullable self-FK; `assessed_at`.
- Unique `(probe_response_id, revision)`; unique non-null
  `supersedes_probe_assessment_id` prevents competing successor revisions.

AI `other` results create a review task. A human may create a new revision; previous assessments
remain immutable. The current assessment is the row for that response with no successor, resolved by
an anti-join; no previous row is updated to mark it non-current.

### `exercise`

**Purpose:** Stable artifact-correction exercise identity for one divergence.

- `id uuid` PK; `organization_id`; `divergence_id` FK; `created_at`; `retired_at`.

### `exercise_version`

**Purpose:** Immutable realistic correction task and feedback rubric.

- `id uuid` PK; `organization_id`; `exercise_id` FK; `version_number`.
- `title`; `instructions`; `artifact_kind`; `starter_content text` or
  `starter_storage_object_id` nullable.
- `answer_format` fixed to `artifact_edit`; `grading_rubric jsonb`.
- `new_rule_evidence_span_id` FK; `record_status`; `ai_model_run_id` nullable.
- `supersedes_exercise_version_id`; `created_by_membership_id`; `created_at`.
- Unique `(exercise_id, version_number)`.
- A check requires exactly one starter payload: inline content or a storage object.

### `remediation_assignment`

**Purpose:** Active correction work created from an assessed old-rule response.

- `id uuid` PK; `organization_id`; `person_id`; `trigger_probe_assessment_id` FK unique.
- `exercise_version_id` FK; `status remediation_status`; `assigned_at`; `due_at`.
- `opened_at`, `completed_at`; `created_at`, `updated_at`.
- Index `(person_id, status, due_at)` and ChangeEvent through the trigger assessment.

The exercise version must be listed in `release_exercise` for the release that created the triggering
probe assignment and must belong to the same divergence.

### `remediation_attempt`

**Purpose:** One submitted artifact correction and its feedback/outcome.

- `id uuid` PK; `organization_id`; `remediation_assignment_id` FK; `attempt_number integer`.
- `submission_text_ciphertext` or `submission_storage_object_id`.
- `submitted_at`; `ai_model_run_id` nullable; `outcome varchar(16)` constrained to `passed`,
  `failed`, `needs_review`.
- `feedback text`; `feedback_evidence_span_id` FK; `reviewed_by_membership_id` nullable;
  `assessed_at`.
- Unique `(remediation_assignment_id, attempt_number)`.
- A check requires exactly one submission payload: encrypted text or a storage object.

Feedback must cite the approved new source; passive rereading is not a remediation attempt.

### `recheck_assignment`

**Purpose:** Durable 30/90-day schedule that later dispatches a different approved case.

- `id uuid` PK; `organization_id`; `remediation_assignment_id` FK;
  `divergence_id` FK; `person_id` FK.
- `interval_days integer CHECK IN (30, 90)`; `due_at`; `status recheck_status`.
- `original_case_version_id` FK; `selected_case_version_id` nullable FK.
- `dispatched_at`, `completed_at`; `created_at`, `updated_at`.
- Unique `(remediation_assignment_id, interval_days)`; due-work index `(status, due_at)`.
- Constraint trigger requires the selected case to belong to the same divergence, be approved and
  not retired, and have a different underlying `divergence_case_id` from the original and the other
  recheck selected for this remediation. A new version of the same scenario does not count as a
  different case.

The resulting probe points back through `probe_assignment.recheck_assignment_id`; keeping the FK in
one direction avoids a circular insertion dependency.

## 12. Approval, audit, retention, and reporting

### `approval_policy`

**Purpose:** Tenant-configurable approval requirements for governed actions.

- `id uuid` PK; `organization_id`; `object_type`; `action`.
- `minimum_approvals integer CHECK >= 1`; `require_distinct_creator boolean`;
  `require_distinct_requester boolean`; `require_recent_auth boolean`; `require_mfa boolean`.
- `status record_status`; `version_number`; `effective_from`; `created_by_membership_id`;
  `supersedes_approval_policy_id` nullable self-FK; `created_at`.
- Unique active `(organization_id, object_type, action)`.

Required defaults cover ChangeEvent validation, dependency-edge review, case approval, release
authorization, exercise approval, artifact remediation verification, report export, retention
changes, and legal hold.

### `approval_policy_role`

**Purpose:** Roles permitted to satisfy an approval policy.

- `organization_id`; `approval_policy_id` FK; `role_code` FK.
- PK `(approval_policy_id, role_code)`.

### `approval_record`

**Purpose:** Append-only evidence that an authenticated human acted in an eligible role on an exact
object version.

- `id uuid` PK; `organization_id`; `approval_policy_id` FK.
- `actor_membership_id` FK; `actor_role_code` FK.
- `object_type`; `object_id`; `object_version_id` non-null; `action`.
- `authentication_age_seconds integer`; `mfa_verified boolean`; `metadata jsonb`; `created_at`.
- Index `(organization_id, object_type, object_id, created_at)` and actor timeline.
- Unique `(approval_policy_id, object_version_id, action, actor_membership_id)` prevents one actor
  from satisfying the same approval requirement more than once.
- Database trigger verifies active membership/role, policy eligibility, object tenant/version, and
  separation-of-duties conditions.
- Application role has `INSERT`/`SELECT` only; update/delete trigger rejects mutation.

The authenticated service—not the database—verifies AuthKit session age and MFA claims before the
transaction and records the resulting evidence fields. Database triggers enforce the facts they can
independently prove: active membership/role, tenant/object/version validity, policy role, approval
counts, and actor separation.

Approval object mapping is explicit per action:

- conventional versioned objects use their logical parent ID and immutable version ID;
- `artifact_remediation` verification uses the remediation ID as the object and the resolving
  `artifact_version.id` as the approved version;
- inherently self-versioned snapshots such as a submitted `release_batch`, `retention_policy`,
  `legal_hold`, or requested `report_bundle` use their own row ID as `object_version_id` (and as
  `object_id` when no separate logical parent exists). Their decision inputs and child case/target/
  audience rows are locked before approval; only permitted lifecycle fields may change afterward.

The object-type registry defines this mapping and the columns locked at each transition. A mutable
logical ID alone is never sufficient.

### `audit_event`

**Purpose:** Append-only observable domain and security event ledger.

- `id uuid` PK; `organization_id`; `actor_type actor_type`.
- `actor_membership_id`, `service_account_id`, `support_operator_id` nullable with actor-type check.
- `event_type varchar(128)`; `object_type`; `object_id`; `object_version_id` nullable.
- `request_id`, `workflow_run_id` nullable; `payload jsonb`; `occurred_at`.
- BRIN index on `occurred_at` at scale; B-tree tenant/object and tenant/timeline indexes.
- Payload allow-list forbids document text, probe answers, emails, tokens, and signed URLs.
- Insert/select only; update/delete trigger rejects mutation.

### `report_bundle`

**Purpose:** Requested and generated audit export for one ChangeEvent snapshot.

- `id uuid` PK; `organization_id`; `change_event_version_id` FK.
- `requested_by_membership_id`; `status report_status`; `query_cutoff_at`.
- `include_individual_results boolean`; `template_version`; `application_release_sha`.
- `storage_object_id` nullable FK; `bundle_sha256` nullable; `manifest jsonb` nullable;
  `manifest_signature` nullable; `signature_algorithm` nullable and constrained to `hmac-sha256`
  when present; `signing_key_version` nullable so rotation does not make old signatures unverifiable.
- `retention_mode` nullable; `retain_until`; `object_lock_version_id` nullable.
- `workflow_run_id`; `requested_at`, `completed_at`, `expires_at`; `error_summary`.
- Unique idempotency key; indexes by ChangeEvent/status.

Individual detail is allowed only when policy and caller permission both allow it.

### `report_bundle_item`

**Purpose:** Manifest member and checksum for every PDF/CSV/JSON file in a bundle.

- `organization_id`; `report_bundle_id` FK; `path varchar(512)`; `media_type`; `size_bytes`;
  `sha256 char(64)`.
- `storage_object_id` nullable FK; `position integer`.
- PK `(report_bundle_id, path)`; unique position.

### `retention_policy`

**Purpose:** Versioned retention rule by data class.

- `id uuid` PK; `organization_id`; `data_class varchar(64)`.
- `version_number`; `retention_days integer CHECK > 0`; `retention_mode`;
  `disposition_action varchar(16)` constrained to `delete`, `anonymize`, or `retain`.
- `status record_status`; `effective_from`; `supersedes_retention_policy_id` nullable self-FK;
  `created_by_membership_id`; `created_at`.
- Unique `(organization_id, data_class, version_number)`; one active policy per class.

### `legal_hold`

**Purpose:** Privileged hold that prevents disposition of specified governed data.

- `id uuid` PK; `organization_id`; `scope_type`; `scope_id` nullable; `reason`; `reference`.
- `starts_at`; `released_at` nullable; `created_by_membership_id`;
  `released_by_membership_id` nullable; `created_at`.
- Index active holds by organization/scope.

### `data_disposition_run`

**Purpose:** Auditable execution of retention deletion/anonymization.

- `id uuid` PK; `organization_id`; `retention_policy_id` FK; `workflow_run_id` FK.
- `cutoff_at`; `status workflow_status`; `candidate_count`, `disposed_count`, `held_count`.
- `manifest_storage_object_id` nullable FK; `manifest_sha256`; `started_at`, `completed_at`;
  `created_at`.
- No raw disposed content in the manifest.

## 13. Integrations, notifications, workflows, and operations

### `integration_connection`

**Purpose:** Tenant configuration for WorkOS sync, Postmark, Slack, HRIS, or LMS adapters.

- `id uuid` PK; `organization_id`; `type integration_type`; `name`;
  `status connection_status`.
- `external_account_id`; `credential_reference` nullable; `configuration jsonb`.
- `last_verified_at`; `created_by_membership_id`; `created_at`, `updated_at`.
- Unique `(organization_id, type, name)` among active connections.
- Configuration is schema-validated and contains no plaintext secret.

### `integration_event`

**Purpose:** Deduplicated inbound webhook/provider event record.

- `id uuid` PK; `organization_id`; `integration_connection_id` FK.
- `external_event_id`; `event_type`; `signature_verified boolean`.
- `payload_sha256`; `received_at`; `processed_at`; `status processing_status`;
  `error_summary` nullable.
- Unique `(integration_connection_id, external_event_id)`; processing queue index.

### `integration_job`

**Purpose:** Import/export execution such as HRIS CSV, xAPI, or SCORM.

- `id uuid` PK; `organization_id`; `integration_connection_id` nullable.
- `job_type`; `direction varchar(8)` constrained to `import` or `export`.
- `storage_object_id` nullable; `status workflow_status`; `workflow_run_id` nullable.
- `requested_by_membership_id`; summary counts; `created_at`, `completed_at`.

### `integration_job_item`

**Purpose:** Row/statement-level outcome without failing the entire job.

- `id uuid` PK; `organization_id`; `integration_job_id` FK; `position integer`.
- `external_key`; `status processing_status`; `result_object_type`, `result_object_id` nullable.
- `error_code`, `error_summary` nullable; `payload_sha256`; `created_at`.
- Unique `(integration_job_id, position)`; failed-item index.

### `notification`

**Purpose:** In-app actionable notification for review, approval, assignment, or workflow failure.

- `id uuid` PK; `organization_id`; exactly one of `membership_id` or `person_id`.
- `type varchar(64)`; `title`; `body_summary`; `action_path` internal relative URL.
- `object_type`, `object_id`, `object_version_id` nullable; `read_at`, `dismissed_at`.
- `created_at`; index unread recipient notifications.

No sensitive source or response content is placed in notification text.

### `notification_preference`

**Purpose:** Recipient-level channel preferences without allowing a user to disable mandatory
governance notices.

- `id uuid` PK; `organization_id`; exactly one of `membership_id` or `person_id`.
- `notification_category varchar(64)`; `channel varchar(16)`.
- `enabled boolean`; `digest_mode varchar(16)` constrained to `immediate`, `daily`, or `none`.
- `updated_at`.
- Partial unique indexes cover `(membership_id, notification_category, channel)` when membership is
  set and `(person_id, notification_category, channel)` when person is set.
- Service policy ignores opt-out for mandatory security, assignment, approval, and retention events.

### `notification_delivery`

**Purpose:** Channel attempt and provider lifecycle for a notification.

- `id uuid` PK; `organization_id`; `notification_id` FK.
- `channel`; `integration_connection_id` nullable; `provider_message_id` nullable.
- `status processing_status`; `attempt_count`; `last_attempt_at`; `delivered_at`;
  `error_summary`; `created_at`, `updated_at`.
- Unique provider message ID; retry queue index.

### `workflow_run`

**Purpose:** Durable product projection of an Inngest workflow.

- Existing scaffold fields remain: `id uuid` PK, `organization_id`, `external_run_id`, `workflow_name`,
  `subject_type`, `subject_id`, `status`, progress counters, error summary, timestamps.
- Add `idempotency_key`, `attempt`, `trigger_event_id`, `next_retry_at`, and `last_heartbeat_at`.
- Unique `(organization_id, workflow_name, idempotency_key)`; indexes by subject/status and stale run.

### `workflow_step`

**Purpose:** Visible, independently retriable step projection.

- `id uuid` PK; `organization_id`; `workflow_run_id` FK; `step_key`; `attempt`.
- `status workflow_status`; `started_at`, `completed_at`; `next_retry_at`.
- `error_code`, `error_summary`; `metrics jsonb`; `created_at`, `updated_at`.
- Unique `(workflow_run_id, step_key, attempt)`; active-step index.

### `outbox_event`

**Purpose:** Transactional handoff from committed domain state to Inngest/integrations.

- Existing scaffold fields remain: `id uuid` PK, `organization_id`, `event_name`, aggregate identity,
  `idempotency_key`, `payload`, status, attempts, availability/publication/error timestamps.
- Unique `(organization_id, idempotency_key)`; dispatch index `(status, available_at)`.
- Payload carries identifiers and versions, not large documents or answers.

### `idempotency_record`

**Purpose:** Safe replay handling for workflow-starting REST writes.

- `id uuid` PK; `organization_id`; `principal_type actor_type`; `principal_id uuid`.
- `route_key`; `idempotency_key`; `request_sha256`; `status_code integer`.
- `response_headers jsonb`; `response_body jsonb` nullable; `object_type`, `object_id` nullable.
- `locked_until`; `expires_at`; `created_at`, `completed_at`.
- Unique `(organization_id, principal_type, principal_id, route_key, idempotency_key)`.
- Reuse with a different request hash returns `409 Conflict`.
- For sensitive or large responses, persist only the status, safe headers, and resulting object
  reference; do not duplicate probe answers, document text, signed URLs, or export bytes in
  `response_body`.

### `usage_event`

**Purpose:** Append-only tenant cost/quota ledger across AI, workflow, storage, and delivery.

- `id uuid` PK; `organization_id`; `category varchar(32)`; `provider`.
- `quantity numeric`; `unit`; `cost_minor bigint`; `currency char(3)`.
- `subject_type`, `subject_id`, `workflow_run_id` nullable; `occurred_at`.
- Index `(organization_id, occurred_at)` and category period; no raw content.

## 14. Principal relationships and cardinality

```mermaid
erDiagram
  ORGANIZATION ||--|| ORGANIZATION_SETTINGS : configures
  ORGANIZATION ||--o{ MEMBERSHIP : has
  MEMBERSHIP ||--o{ MEMBERSHIP_ROLE : receives
  ROLE ||--o{ MEMBERSHIP_ROLE : grants
  ROLE ||--o{ ROLE_PERMISSION : contains
  PERMISSION ||--o{ ROLE_PERMISSION : maps

  ORGANIZATION ||--o{ PERSON : tracks
  MEMBERSHIP o|--o| PERSON : authenticates
  PERSON ||--o{ PERSON_WORK_ROLE : holds
  WORK_ROLE ||--o{ PERSON_WORK_ROLE : groups
  WORK_ROLE ||--o{ ROLE_ARTIFACT_EXPOSURE : acts_on
  ARTIFACT ||--o{ ROLE_ARTIFACT_EXPOSURE : exposed_by

  SOURCE ||--o{ SOURCE_VERSION : versions
  ARTIFACT ||--o{ ARTIFACT_VERSION : versions
  DOCUMENT_VERSION ||--o{ DOCUMENT_CHUNK : chunks
  DOCUMENT_VERSION ||--o{ EVIDENCE_SPAN : locates
  ARTIFACT ||--o{ CLAIM : contains
  CLAIM ||--o{ CLAIM_VERSION : versions

  GRAPH_NODE ||--o{ DEPENDENCY_EDGE_VERSION : from
  GRAPH_NODE ||--o{ DEPENDENCY_EDGE_VERSION : to
  DEPENDENCY_EDGE ||--o{ DEPENDENCY_EDGE_VERSION : versions

  CHANGE_EVENT ||--o{ CHANGE_EVENT_VERSION : versions
  CHANGE_EVENT_VERSION ||--o{ CHANGE_EVENT_VERSION_CITATION : cites
  CHANGE_EVENT_VERSION ||--o{ PROPAGATION_RUN : computes
  PROPAGATION_RUN ||--o{ CHANGE_IMPACT : finds
  CHANGE_IMPACT ||--o{ CHANGE_IMPACT_PATH : explains
  CHANGE_IMPACT_PATH ||--o{ CHANGE_IMPACT_PATH_STEP : orders

  CHANGE_EVENT_VERSION ||--o{ DIVERGENCE : defines
  DIVERGENCE ||--o{ DIVERGENCE_CASE : groups
  DIVERGENCE_CASE ||--o{ DIVERGENCE_CASE_VERSION : versions
  RELEASE_BATCH }o--o{ DIVERGENCE_CASE_VERSION : includes
  RELEASE_BATCH }o--o{ EXERCISE_VERSION : authorizes
  RELEASE_BATCH ||--o{ RELEASE_TARGET : targets
  RELEASE_TARGET ||--o{ RELEASE_TARGET_PERSON : resolves
  PERSON ||--o{ RELEASE_TARGET_PERSON : included
  RELEASE_BATCH ||--o{ PROBE_ASSIGNMENT : creates
  PERSON ||--o{ PROBE_ASSIGNMENT : receives
  PROBE_ASSIGNMENT ||--o| PROBE_RESPONSE : submits
  PROBE_RESPONSE ||--o{ PROBE_ASSESSMENT : assesses
  PROBE_ASSESSMENT ||--o| REMEDIATION_ASSIGNMENT : triggers
  REMEDIATION_ASSIGNMENT ||--o{ REMEDIATION_ATTEMPT : attempts
  REMEDIATION_ASSIGNMENT ||--o{ RECHECK_ASSIGNMENT : schedules

  APPROVAL_POLICY ||--o{ APPROVAL_RECORD : governs
  CHANGE_EVENT_VERSION ||--o{ REPORT_BUNDLE : reports
  REPORT_BUNDLE ||--o{ REPORT_BUNDLE_ITEM : contains
  WORKFLOW_RUN ||--o{ WORKFLOW_STEP : projects
```

Important cardinality rules not fully expressible in the diagram:

- One membership can hold many authorization roles; one person can hold many work roles. These are
  intentionally separate many-to-many relationships.
- A source/artifact/claim has many immutable versions, but at most one approved current version.
- A case version has at least one old and one new citation.
- A probe assignment has at most one raw response but may have multiple immutable assessment
  revisions, with exactly one current assessment.
- One assessed old-rule response creates at most one remediation assignment. One passed remediation
  schedules exactly two rechecks, at 30 and 90 days.
- Approval records are generic references so one append-only mechanism can govern multiple object
  types; database triggers validate that the referenced object/version exists in the same tenant.

## 15. Ownership and permission rules

| Data area                           | Write owners                                                        | Read boundaries                                                               |
| ----------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Tenant settings, memberships, roles | `org_admin`; privileged changes require recent auth/MFA             | Organization members with explicit admin permission                           |
| Sources, artifacts, corpus          | Corpus editors/stewards through explicit permissions                | Tenant members; source-file access additionally signed and policy checked     |
| Claims and edges                    | Extraction workflow proposes; `edge_reviewer` accepts/edits/rejects | Tenant reviewers; accepted graph available to change workflows                |
| ChangeEvents                        | `change_owner` drafts; a distinct `change_validator` validates      | Authorized tenant reviewers and auditors                                      |
| Artifact remediation                | Artifact owners/stewards submit; configured reviewer verifies       | Propagate/Displace authorized users                                           |
| People and work roles               | HRIS sync or authorized admin                                       | Displace only; aggregate by default                                           |
| Cases                               | AI proposes; `case_approver` approves/retire decisions              | Displace reviewers; learner sees only released case assigned to them          |
| Releases                            | Requester prepares; `release_authorizer` authorizes                 | Release team and auditors                                                     |
| Probe/remediation data              | Assigned person submits; grading workflow/human reviewer assesses   | Self plus explicitly permitted individual-results roles; otherwise aggregates |
| Audit/report data                   | System appends; `auditor` requests permitted exports                | Auditors, with individual data filtered by organization policy                |
| Support access                      | Distinct platform operators request/approve a short grant           | Only grant scope and duration; every use audited                              |

RLS is necessary but not sufficient. Domain services must also check product configuration,
permission, object state, version freshness, separation of duties, recent authentication, and
individual-result policy.

## 16. Cross-table constraints requiring triggers or deferred checks

The following rules must be implemented in reviewed SQL, not left to UI validation:

1. Tenant equality across every duplicated `organization_id` and referenced tenant object.
2. Approved/version-locked rows reject update/delete; editing creates a successor version.
3. ChangeEvent creator cannot validate the same version; release requester/authorizer separation is
   policy-driven.
4. Approval actor has an active membership, active role, permitted policy role, and suitable
   authentication/MFA state.
5. ChangeEvent old/new source versions are distinct versions of the same source, and submitted
   versions contain at least one verified citation to each corresponding source version.
6. `graph_node` has exactly one correctly typed version FK; edge endpoints share a tenant.
7. `change_impact`, `release_target`, notification recipient, exercise starter, response payload, and
   remediation submission satisfy their exact-one-field constraints.
8. Propagate organizations cannot insert/read Displace-only entities.
9. Approved cases have verified old/new citations and cannot be newly assigned after retirement.
10. A release's resolved audience rows match its targets and count/hash; assignment creation uses the
    immutable snapshot rather than re-resolving current HRIS mappings.
11. A release contains approved, unretired case and exercise versions for the same ChangeEvent;
    remediation assignments use only an exercise version authorized in their triggering release.
12. Initial, 30-day, and 90-day probes use three distinct case identities from the same divergence;
    selected versions are approved and unretired.
13. Initial probe assignments have no recheck reference; recheck assignments have one, and their
    `assignment_kind`, person, divergence, interval, and selected case agree with the linked due row.
14. A remediation/recheck transition re-verifies that its trigger is still the current old-rule
    assessment. If a human revision changes that label, pending remediation/rechecks are cancelled
    transactionally; completed observable events remain historical.
15. Historical metrics exclude responses tied to a case retirement marked
    `excludes_historical_metrics`, without deleting evidence.
16. Report bundles reference a consistent cutoff snapshot and cannot include individual results
    without both tenant policy and caller permission.
17. Legal holds block storage deletion and disposition jobs regardless of retention age.
18. Append-only tables reject `UPDATE` and `DELETE` for application and workflow roles.
19. Once a release awaits authorization, its case/exercise set, targets, resolved audience, counts,
    and hashes are immutable; once a report is requested, its cutoff, scope, and template version are
    immutable.

## 17. Indexing strategy

- Put `(organization_id, ...)` first on tenant list, status, and timeline indexes so RLS-filtered
  queries remain selective.
- Use partial indexes for current/active assignments, accepted edge versions, open review tasks,
  pending outbox events, due rechecks, unread notifications, and active legal holds.
- Use GIN for `document_chunk.search_vector`; use HNSW cosine on `embedding vector(768)`. Apply tenant,
  version, and status filters before candidates can enter a model prompt. Because approximate-index
  filtering can under-return results, enable/test pgvector iterative scans or safely over-fetch then
  deterministically filter; measure recall with tenant/version filters rather than assuming the ANN
  index pre-filters perfectly.
- Index both directions of accepted dependency edges for recursive traversal.
- Use BRIN on very large append-only time-series tables (`audit_event`, `probe_delivery_event`,
  `usage_event`) only after row counts justify it; retain tenant/timeline B-tree indexes.
- Avoid indexing raw encrypted response text or large JSON payloads. Add expression indexes only for
  stable, measured JSON access patterns.
- Partition append-only tables by time or tenant only after measured growth; the initial schema
  remains unpartitioned for hackathon speed.

## 18. Scaffold alignment and migration order

The scaffold already defines `organization`, `membership`, `role`, `membership_role`,
`approval_record`, `audit_event`, `outbox_event`, and `workflow_run`, plus RLS helpers and append-only
triggers. Preserve their IDs and evolve them with expand/migrate/contract migrations.

Recommended schema implementation order:

1. Extend identity tables; add permissions, settings, service principals, and approval policies.
2. Add people/work-role tables behind Displace RLS policies.
3. Add storage, documents, corpora, sources, artifacts, chunks, and evidence spans.
4. Add AI provenance, review, claims, graph nodes, and edge versions.
5. Add ChangeEvent, propagation, impact paths, and artifact remediation.
6. Add divergence, case, release, probe, remediation, and recheck tables.
7. Add reports, retention/legal hold, integrations, notifications, workflow steps, idempotency, and
   usage accounting.
8. Backfill current scaffold fields where ownership moved—for example policy settings into
   `organization_settings`—then remove obsolete columns only after application compatibility.

Specific scaffold migrations that must use expand/backfill/contract rather than direct replacement:

- Add `membership_role.id` and historical grant/revocation columns while retaining the current
  composite key; backfill IDs, move dependent references, then replace the key in a later migration.
- Create `organization_settings`, copy `organization.individual_results_visible` into the new policy
  representation, deploy dual-read/dual-write compatibility, then remove the old column.
- Add `approval_record.approval_policy_id` and new audit actor fields as nullable, create/backfill
  default policies and actor types for existing rows, then enforce non-null/check constraints.
- Extend PostgreSQL enums in a forward-compatible migration before application code writes new values.
- Add cross-domain and self-referential FKs as `NOT VALID` where needed, validate after backfill, and
  use deferrable constraints only for genuine same-transaction cycles.
- Never introduce a non-null column without a default/backfill path on a populated table, and never
  rewrite append-only history to simulate a new event.

Each migration stage must include RLS, grants, tenant-mismatch tests, negative authorization tests,
and downgrade/forward-recovery notes before dependent application code is merged.

## 19. Pre-implementation breaking-point checklist

These risks must be resolved in migrations and domain services before the affected feature is
enabled:

1. **RLS owner bypass:** table owners bypass ordinary RLS. Production uses a non-owner application
   role, `FORCE ROW LEVEL SECURITY`, explicit grants, and tests executed as the real runtime roles.
2. **Background tenant context:** Inngest and scheduled jobs must resolve one organization and set
   transaction-local tenant context before data access; a global service credential is not permission
   to issue unscoped queries.
3. **Polymorphic references:** approval, audit, review, workflow, idempotency, and model-run subject
   columns use an allow-listed object registry in service code plus constraint triggers for tenant and
   version existence. Unknown object types fail closed.
4. **Deferred aggregate rules:** requirements such as “both old and new citations exist” cannot be a
   row `CHECK`. The submission/approval transition locks the parent and uses a deferred constraint
   trigger so incomplete drafts can exist but governed transitions cannot commit incomplete data.
5. **Immutable content versus lifecycle state:** draft content may be edited only through the version
   service. After submission/approval, content-column updates are rejected; narrowly allowed lifecycle
   transitions create audit events, and substantive edits create successor versions.
6. **Database/object-store atomicity:** PostgreSQL and R2/S3 do not share a transaction. Uploads use
   quarantine → verified metadata transaction → promotion with idempotent repair/cleanup; report
   generation records failure rather than claiming completion when object storage fails.
7. **Audience reproducibility:** release authorization locks the case set, targets, resolved-person
   rows, counts, and hashes. Assignments consume that snapshot and never re-resolve current HRIS data.
8. **Approximate search filtering:** HNSW recall with tenant/version filters is measured using iterative
   scans or safe over-fetch. Authorization is rechecked deterministically before prompt construction.
9. **Version and dispatcher races:** parent-row/advisory locks plus unique constraints protect version
   allocation; `FOR UPDATE SKIP LOCKED` or equivalent protects due-row and outbox dispatch.
10. **Sensitive replay/provenance storage:** idempotency and model-run JSON do not duplicate raw source
    text, answers, signed URLs, or export bytes unless encrypted and retention-classified.
11. **Metrics after retirement:** dashboards select current valid assessment revisions and exclude
    case versions retired for ambiguity while retaining the underlying assignments, responses, and
    audit evidence.
12. **Migration dependency order:** forward references such as a probe's optional recheck link and a
    person's optional integration source are added after both tables exist or via `ALTER TABLE`; they
    do not require mutually non-null inserts.

## 20. Deliberately external or derived data

The following are intentionally not additional tables:

- WorkOS owns passwords, sessions, MFA factors, SSO connections, and directory credentials.
- R2/S3 owns file bytes; PostgreSQL stores metadata, integrity, and retention references.
- Inngest owns execution mechanics; PostgreSQL stores the durable product projection and domain
  truth.
- Dashboard counts, blast-radius percentages, and learner state are derived from immutable events
  and current valid records. They may later receive refreshable materialized views, but those views
  are not authoritative.
- A recheck result is the current assessment of the probe linked through
  `probe_assignment.recheck_assignment_id`; it is not duplicated in a mutable `recheck_result`
  column or table.
- Prompt bodies and report-template source live in version control; database rows record immutable
  hashes, versions, and release SHAs.
- Seeded-persona response patterns live in versioned development/demo fixtures and are materialized
  through the normal assignment/response services. They are not a production behavior table, and
  simulated delivery always uses the `simulated` channel and `is_seeded_persona` marker.
- Automated source watchers are outside v1 and therefore have no watcher/feed tables in this
  schema.
