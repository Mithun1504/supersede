-- Temporarily remove scaffold append-only triggers for the controlled history backfill below.
-- 0003 reinstalls stricter append-only enforcement in the same migration chain.
DROP TRIGGER IF EXISTS "approval_record_append_only" ON "approval_record";--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_event_append_only" ON "audit_event";--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('membership', 'service_account', 'system', 'support_operator');--> statement-breakpoint
CREATE TYPE "public"."answer_format" AS ENUM('single_choice', 'multiple_choice', 'free_text', 'artifact_edit');--> statement-breakpoint
CREATE TYPE "public"."artifact_kind" AS ENUM('protocol', 'course', 'claim_library_entry', 'decision_doc', 'marketing_material', 'order_set', 'configuration', 'other');--> statement-breakpoint
CREATE TYPE "public"."artifact_remediation_status" AS ENUM('open', 'assigned', 'in_progress', 'submitted', 'needs_review', 'verified', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."assessment_label" AS ENUM('old', 'new', 'other');--> statement-breakpoint
CREATE TYPE "public"."assessment_source" AS ENUM('deterministic', 'ai', 'human');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('assigned', 'opened', 'submitted', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."case_retirement_reason" AS ENUM('ambiguous', 'citation_invalid', 'content_error', 'source_superseded', 'policy_change', 'other');--> statement-breakpoint
CREATE TYPE "public"."change_event_status" AS ENUM('draft', 'submitted', 'validated', 'rejected', 'superseded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('draft', 'active', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."delivery_event_type" AS ENUM('assigned', 'provider_accepted', 'delivered', 'bounced', 'opened', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."dependency_edge_type" AS ENUM('contains', 'supported_by', 'references', 'depends_on', 'informs');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'inactive', 'retired');--> statement-breakpoint
CREATE TYPE "public"."evidence_verification_status" AS ENUM('pending', 'exact', 'fuzzy_verified', 'failed', 'human_verified');--> statement-breakpoint
CREATE TYPE "public"."graph_node_type" AS ENUM('source_version', 'artifact_version', 'claim_version');--> statement-breakpoint
CREATE TYPE "public"."impact_class" AS ENUM('load_bearing', 'peripheral', 'potential_exposure', 'unreviewed_candidate');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('workos', 'postmark', 'slack', 'hris_csv', 'lms_xapi', 'lms_scorm');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('active', 'inactive', 'deprovisioned');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('queued', 'running', 'partial', 'failed', 'completed', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."recheck_status" AS ENUM('scheduled', 'due', 'dispatched', 'completed', 'cancelled', 'blocked_no_case');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('draft', 'in_review', 'approved', 'rejected', 'superseded', 'retired');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('draft', 'awaiting_authorization', 'authorized', 'releasing', 'released', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."remediation_status" AS ENUM('assigned', 'opened', 'submitted', 'needs_review', 'passed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('requested', 'generating', 'failed', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."retention_mode" AS ENUM('governance', 'compliance');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('suggested', 'needs_review', 'accepted', 'edited', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_task_status" AS ENUM('open', 'assigned', 'in_progress', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_task_type" AS ENUM('claim', 'dependency_edge', 'quote_verification', 'probe_assessment', 'artifact_remediation', 'workflow_failure');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'clean', 'rejected', 'failed', 'not_required_demo');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('guideline', 'regulation', 'paper', 'standard', 'internal_policy');--> statement-breakpoint
CREATE TYPE "public"."source_version_status" AS ENUM('active', 'superseded', 'retracted', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."storage_purpose" AS ENUM('quarantine', 'working_original', 'derived_text', 'remediation_submission', 'report_bundle', 'report_member');--> statement-breakpoint
-- Rebuild existing enums instead of ADD VALUE so a clean Drizzle migration transaction may
-- safely use the new values. PostgreSQL otherwise requires ADD VALUE to commit separately.
ALTER TABLE "workflow_run" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."workflow_status" RENAME TO "workflow_status_legacy";--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('queued', 'running', 'partial', 'failed', 'completed', 'quota_paused', 'cancelled');--> statement-breakpoint
ALTER TABLE "workflow_run" ALTER COLUMN "status" TYPE "public"."workflow_status" USING "status"::text::"public"."workflow_status";--> statement-breakpoint
ALTER TABLE "workflow_run" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
DROP TYPE "public"."workflow_status_legacy";--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."membership_status" RENAME TO "membership_status_legacy";--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'deprovisioned');--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "status" TYPE "public"."membership_status" USING "status"::text::"public"."membership_status";--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
DROP TYPE "public"."membership_status_legacy";--> statement-breakpoint
CREATE TABLE "ai_model_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_run_id" uuid,
	"extraction_run_id" uuid,
	"task_type" varchar(64) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"model" varchar(128) NOT NULL,
	"resolved_model" varchar(128) NOT NULL,
	"ai_prompt_version_id" uuid,
	"subject_type" varchar(64) NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version_id" uuid,
	"application_release_sha" char(40) NOT NULL,
	"external_response_id" varchar(255),
	"reasoning_setting" varchar(64),
	"status" "processing_status" DEFAULT 'queued' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_minor" bigint,
	"latency_ms" integer,
	"validation_outcome" varchar(64),
	"output_json" jsonb,
	"error_code" varchar(64),
	"error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_run_release_sha_chk" CHECK ("ai_model_run"."application_release_sha" ~ '^[0-9a-f]{40}$'),
	CONSTRAINT "ai_model_run_metrics_chk" CHECK (coalesce("ai_model_run"."input_tokens", 0) >= 0 and coalesce("ai_model_run"."output_tokens", 0) >= 0 and coalesce("ai_model_run"."cost_minor", 0) >= 0 and coalesce("ai_model_run"."latency_ms", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" varchar(64) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"schema_version" varchar(64) NOT NULL,
	"source_path" text NOT NULL,
	"git_commit_sha" char(40) NOT NULL,
	"prompt_sha256" char(64) NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_version_git_sha_chk" CHECK ("ai_prompt_version"."git_commit_sha" ~ '^[0-9a-f]{40}$'),
	CONSTRAINT "ai_prompt_version_prompt_sha_chk" CHECK ("ai_prompt_version"."prompt_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "ai_run_input" (
	"organization_id" uuid NOT NULL,
	"ai_model_run_id" uuid NOT NULL,
	"document_version_id" uuid,
	"source_version_id" uuid,
	"artifact_version_id" uuid,
	"input_role" varchar(32) NOT NULL,
	"content_sha256" char(64) NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "ai_run_input_ai_model_run_id_position_pk" PRIMARY KEY("ai_model_run_id","position"),
	CONSTRAINT "ai_run_input_reference_chk" CHECK (num_nonnulls("ai_run_input"."document_version_id", "ai_run_input"."source_version_id", "ai_run_input"."artifact_version_id") >= 1),
	CONSTRAINT "ai_run_input_sha_chk" CHECK ("ai_run_input"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ai_run_input_position_chk" CHECK ("ai_run_input"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_run_retrieval_chunk" (
	"organization_id" uuid NOT NULL,
	"ai_model_run_id" uuid NOT NULL,
	"document_chunk_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"semantic_score" numeric(8, 6),
	"lexical_score" numeric(8, 6),
	"fused_score" numeric(8, 6),
	CONSTRAINT "ai_run_retrieval_chunk_ai_model_run_id_document_chunk_id_pk" PRIMARY KEY("ai_model_run_id","document_chunk_id"),
	CONSTRAINT "ai_run_retrieval_rank_chk" CHECK ("ai_run_retrieval_chunk"."rank" >= 0)
);
--> statement-breakpoint
CREATE TABLE "extraction_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"corpus_id" uuid,
	"workflow_run_id" uuid,
	"status" "workflow_status" DEFAULT 'queued' NOT NULL,
	"cache_key" char(64) NOT NULL,
	"claims_suggested" integer DEFAULT 0 NOT NULL,
	"edges_suggested" integer DEFAULT 0 NOT NULL,
	"quotes_failed" integer DEFAULT 0 NOT NULL,
	"items_requiring_review" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_run_cache_key_chk" CHECK ("extraction_run"."cache_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "extraction_run_counts_chk" CHECK ("extraction_run"."claims_suggested" >= 0 and "extraction_run"."edges_suggested" >= 0 and "extraction_run"."quotes_failed" >= 0 and "extraction_run"."items_requiring_review" >= 0)
);
--> statement-breakpoint
CREATE TABLE "case_retirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_version_id" uuid NOT NULL,
	"reason" "case_retirement_reason" NOT NULL,
	"excludes_historical_metrics" boolean DEFAULT false NOT NULL,
	"rationale" text NOT NULL,
	"retired_by_membership_id" uuid NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approval_record_id" uuid NOT NULL,
	CONSTRAINT "case_retirement_case_version_id_unique" UNIQUE("case_version_id"),
	CONSTRAINT "case_retirement_approval_record_id_unique" UNIQUE("approval_record_id")
);
--> statement-breakpoint
CREATE TABLE "case_version_citation" (
	"organization_id" uuid NOT NULL,
	"case_version_id" uuid NOT NULL,
	"citation_side" varchar(8) NOT NULL,
	"source_version_id" uuid NOT NULL,
	"evidence_span_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "case_version_citation_case_version_id_citation_side_position_pk" PRIMARY KEY("case_version_id","citation_side","position"),
	CONSTRAINT "case_version_citation_side_chk" CHECK ("case_version_citation"."citation_side" in ('old', 'new')),
	CONSTRAINT "case_version_citation_position_chk" CHECK ("case_version_citation"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "divergence_case_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"divergence_case_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"scenario" text NOT NULL,
	"answer_format" "answer_format" NOT NULL,
	"options" jsonb,
	"old_answer" text NOT NULL,
	"new_answer" text NOT NULL,
	"rationale" text NOT NULL,
	"grading_rubric" jsonb NOT NULL,
	"record_status" "record_status" DEFAULT 'draft' NOT NULL,
	"ai_model_run_id" uuid,
	"supersedes_case_version_id" uuid,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "divergence_case_version_number_chk" CHECK ("divergence_case_version"."version_number" > 0),
	CONSTRAINT "divergence_case_options_chk" CHECK (("divergence_case_version"."answer_format" in ('single_choice', 'multiple_choice') and "divergence_case_version"."options" is not null) or ("divergence_case_version"."answer_format" not in ('single_choice', 'multiple_choice') and "divergence_case_version"."options" is null))
);
--> statement-breakpoint
CREATE TABLE "divergence_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"divergence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divergence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"old_rule" text NOT NULL,
	"new_rule" text NOT NULL,
	"affected_population" text NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"created_by_membership_id" uuid,
	"ai_model_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"status" "release_status" DEFAULT 'draft' NOT NULL,
	"requested_by_membership_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_person_count" integer DEFAULT 0 NOT NULL,
	"resolved_person_ids_hash" char(64),
	"authorized_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_batch_count_chk" CHECK ("release_batch"."resolved_person_count" >= 0),
	CONSTRAINT "release_batch_hash_chk" CHECK ("release_batch"."resolved_person_ids_hash" is null or "release_batch"."resolved_person_ids_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "release_case" (
	"organization_id" uuid NOT NULL,
	"release_batch_id" uuid NOT NULL,
	"case_version_id" uuid NOT NULL,
	CONSTRAINT "release_case_release_batch_id_case_version_id_pk" PRIMARY KEY("release_batch_id","case_version_id")
);
--> statement-breakpoint
CREATE TABLE "release_exercise" (
	"organization_id" uuid NOT NULL,
	"release_batch_id" uuid NOT NULL,
	"exercise_version_id" uuid NOT NULL,
	CONSTRAINT "release_exercise_release_batch_id_exercise_version_id_pk" PRIMARY KEY("release_batch_id","exercise_version_id")
);
--> statement-breakpoint
CREATE TABLE "release_target_person" (
	"organization_id" uuid NOT NULL,
	"release_batch_id" uuid NOT NULL,
	"release_target_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"resolved_via" varchar(16) NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_target_person_release_target_id_person_id_pk" PRIMARY KEY("release_target_id","person_id"),
	CONSTRAINT "release_target_person_via_chk" CHECK ("release_target_person"."resolved_via" in ('direct', 'work_role', 'cohort'))
);
--> statement-breakpoint
CREATE TABLE "release_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"release_batch_id" uuid NOT NULL,
	"person_id" uuid,
	"work_role_id" uuid,
	"cohort_id" uuid,
	"resolved_person_count" integer NOT NULL,
	"resolved_person_ids_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_target_exact_one_chk" CHECK (num_nonnulls("release_target"."person_id", "release_target"."work_role_id", "release_target"."cohort_id") = 1),
	CONSTRAINT "release_target_count_chk" CHECK ("release_target"."resolved_person_count" >= 0),
	CONSTRAINT "release_target_hash_chk" CHECK ("release_target"."resolved_person_ids_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "artifact_remediation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_impact_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"impacted_artifact_version_id" uuid NOT NULL,
	"assigned_to_membership_id" uuid,
	"required_action" varchar(32) NOT NULL,
	"status" "artifact_remediation_status" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"resolved_artifact_version_id" uuid,
	"verified_by_membership_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_remediation_action_chk" CHECK ("artifact_remediation"."required_action" in ('rewrite', 'line_edit', 'review_only', 'retire')),
	CONSTRAINT "artifact_remediation_verification_chk" CHECK (("artifact_remediation"."verified_at" is null and "artifact_remediation"."verified_by_membership_id" is null) or ("artifact_remediation"."verified_at" is not null and "artifact_remediation"."verified_by_membership_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "change_event_version_citation" (
	"organization_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"citation_side" varchar(8) NOT NULL,
	"source_version_id" uuid NOT NULL,
	"evidence_span_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "change_event_version_citation_change_event_version_id_citation_side_position_pk" PRIMARY KEY("change_event_version_id","citation_side","position"),
	CONSTRAINT "change_event_citation_side_chk" CHECK ("change_event_version_citation"."citation_side" in ('old', 'new')),
	CONSTRAINT "change_event_citation_position_chk" CHECK ("change_event_version_citation"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "change_event_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"old_source_version_id" uuid NOT NULL,
	"new_source_version_id" uuid NOT NULL,
	"old_rule" text NOT NULL,
	"new_rule" text NOT NULL,
	"affected_population" text NOT NULL,
	"exclusions" text,
	"unresolved_ambiguity" text,
	"diff_summary" text NOT NULL,
	"status" "change_event_status" DEFAULT 'draft' NOT NULL,
	"entered_by_membership_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"ai_model_run_id" uuid,
	"supersedes_change_event_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_event_version_number_chk" CHECK ("change_event_version"."version_number" > 0),
	CONSTRAINT "change_event_version_sources_chk" CHECK ("change_event_version"."old_source_version_id" <> "change_event_version"."new_source_version_id")
);
--> statement-breakpoint
CREATE TABLE "change_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "change_impact_path_step" (
	"organization_id" uuid NOT NULL,
	"change_impact_path_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"graph_node_id" uuid NOT NULL,
	"dependency_edge_version_id" uuid,
	CONSTRAINT "change_impact_path_step_change_impact_path_id_position_pk" PRIMARY KEY("change_impact_path_id","position"),
	CONSTRAINT "change_impact_path_step_position_chk" CHECK ("change_impact_path_step"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "change_impact_path" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_impact_id" uuid NOT NULL,
	"path_rank" integer NOT NULL,
	"path_confidence" numeric(5, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_impact_path_rank_chk" CHECK ("change_impact_path"."path_rank" >= 0),
	CONSTRAINT "change_impact_path_confidence_chk" CHECK ("change_impact_path"."path_confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "change_impact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"propagation_run_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"impact_class" "impact_class" NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"rationale" text NOT NULL,
	"claim_version_id" uuid,
	"artifact_version_id" uuid,
	"work_role_id" uuid,
	"person_id" uuid,
	"requires_remediation" boolean DEFAULT false NOT NULL,
	"review_status" "review_status" DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_impact_target_chk" CHECK (num_nonnulls("change_impact"."claim_version_id", "change_impact"."artifact_version_id", "change_impact"."work_role_id", "change_impact"."person_id") = 1),
	CONSTRAINT "change_impact_confidence_chk" CHECK ("change_impact"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "propagation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"graph_cutoff_at" timestamp with time zone NOT NULL,
	"algorithm_version" varchar(64) NOT NULL,
	"max_depth" integer NOT NULL,
	"status" "workflow_status" DEFAULT 'queued' NOT NULL,
	"nodes_examined" integer DEFAULT 0 NOT NULL,
	"edges_examined" integer DEFAULT 0 NOT NULL,
	"impacts_found" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "propagation_run_depth_chk" CHECK ("propagation_run"."max_depth" between 1 and 50),
	CONSTRAINT "propagation_run_counts_chk" CHECK ("propagation_run"."nodes_examined" >= 0 and "propagation_run"."edges_examined" >= 0 and "propagation_run"."impacts_found" >= 0)
);
--> statement-breakpoint
CREATE TABLE "artifact_owner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"owner_type" varchar(32) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_owner_type_chk" CHECK ("artifact_owner"."owner_type" in ('primary', 'reviewer', 'steward')),
	CONSTRAINT "artifact_owner_effective_chk" CHECK ("artifact_owner"."effective_to" is null or "artifact_owner"."effective_to" > "artifact_owner"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "artifact_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"version_label" varchar(128) NOT NULL,
	"record_status" "record_status" DEFAULT 'draft' NOT NULL,
	"document_version_id" uuid NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"supersedes_artifact_version_id" uuid,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_version_number_chk" CHECK ("artifact_version"."version_number" > 0),
	CONSTRAINT "artifact_version_self_chk" CHECK ("artifact_version"."supersedes_artifact_version_id" is null or "artifact_version"."supersedes_artifact_version_id" <> "artifact_version"."id")
);
--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "artifact_kind" NOT NULL,
	"title" text NOT NULL,
	"external_reference" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "corpus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_artifact" (
	"organization_id" uuid NOT NULL,
	"corpus_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "corpus_artifact_corpus_id_artifact_id_added_at_pk" PRIMARY KEY("corpus_id","artifact_id","added_at")
);
--> statement-breakpoint
CREATE TABLE "corpus_source" (
	"organization_id" uuid NOT NULL,
	"corpus_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "corpus_source_corpus_id_source_id_added_at_pk" PRIMARY KEY("corpus_id","source_id","added_at")
);
--> statement-breakpoint
CREATE TABLE "document_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	"content_sha256" char(64) NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"section_path" text[],
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"location" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"embedding" vector(768),
	"embedding_provider" varchar(64),
	"embedding_model" varchar(128),
	"embedding_version" varchar(64),
	"embedded_at" timestamp with time zone,
	CONSTRAINT "document_chunk_position_chk" CHECK ("document_chunk"."position" >= 0),
	CONSTRAINT "document_chunk_sha_chk" CHECK ("document_chunk"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_chunk_offsets_chk" CHECK ("document_chunk"."start_offset" >= 0 and "document_chunk"."end_offset" >= "document_chunk"."start_offset"),
	CONSTRAINT "document_chunk_pages_chk" CHECK ("document_chunk"."page_start" is null or ("document_chunk"."page_start" >= 0 and ("document_chunk"."page_end" is null or "document_chunk"."page_end" >= "document_chunk"."page_start")))
);
--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"original_storage_object_id" uuid,
	"extracted_text_storage_object_id" uuid,
	"content_sha256" char(64) NOT NULL,
	"detected_mime_type" varchar(255) NOT NULL,
	"parser_name" varchar(128) NOT NULL,
	"parser_version" varchar(64) NOT NULL,
	"processing_status" "processing_status" DEFAULT 'queued' NOT NULL,
	"parser_manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processing_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_count" integer,
	"language" varchar(16),
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_version_sha_chk" CHECK ("document_version"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_version_page_count_chk" CHECK ("document_version"."page_count" is null or "document_version"."page_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "evidence_span" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"document_chunk_id" uuid,
	"exact_quote" text NOT NULL,
	"page_number" integer,
	"section_path" text[],
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"source_content_sha256" char(64) NOT NULL,
	"verification_status" "evidence_verification_status" DEFAULT 'pending' NOT NULL,
	"verification_score" numeric(5, 4),
	"verified_by_membership_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_span_offsets_chk" CHECK ("evidence_span"."start_offset" >= 0 and "evidence_span"."end_offset" >= "evidence_span"."start_offset"),
	CONSTRAINT "evidence_span_sha_chk" CHECK ("evidence_span"."source_content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "evidence_span_score_chk" CHECK ("evidence_span"."verification_score" is null or "evidence_span"."verification_score" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "source_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"version_label" varchar(128) NOT NULL,
	"status" "source_version_status" DEFAULT 'active' NOT NULL,
	"record_status" "record_status" DEFAULT 'draft' NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"document_version_id" uuid NOT NULL,
	"supersedes_source_version_id" uuid,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_version_number_chk" CHECK ("source_version"."version_number" > 0),
	CONSTRAINT "source_version_self_chk" CHECK ("source_version"."supersedes_source_version_id" is null or "source_version"."supersedes_source_version_id" <> "source_version"."id")
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"title" text NOT NULL,
	"canonical_reference" varchar(512),
	"owner_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "storage_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purpose" "storage_purpose" NOT NULL,
	"provider" varchar(16) NOT NULL,
	"bucket_alias" varchar(255) NOT NULL,
	"object_key" text NOT NULL,
	"sha256" char(64) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"original_filename" text,
	"scan_status" "scan_status" DEFAULT 'pending' NOT NULL,
	"encryption_key_reference" text,
	"retention_until" timestamp with time zone,
	"object_lock_mode" "retention_mode",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_object_provider_chk" CHECK ("storage_object"."provider" in ('r2', 's3', 'minio')),
	CONSTRAINT "storage_object_sha_chk" CHECK ("storage_object"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "storage_object_size_chk" CHECK ("storage_object"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "upload_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by_membership_id" uuid NOT NULL,
	"declared_filename" text NOT NULL,
	"declared_mime_type" varchar(255) NOT NULL,
	"declared_size" bigint NOT NULL,
	"storage_object_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" "processing_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_session_size_chk" CHECK ("upload_session"."declared_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "approval_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"object_type" varchar(64) NOT NULL,
	"action" varchar(64) NOT NULL,
	"minimum_approvals" integer DEFAULT 1 NOT NULL,
	"require_distinct_creator" boolean DEFAULT true NOT NULL,
	"require_distinct_requester" boolean DEFAULT false NOT NULL,
	"require_recent_auth" boolean DEFAULT false NOT NULL,
	"require_mfa" boolean DEFAULT false NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"version_number" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"supersedes_approval_policy_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_policy_minimum_chk" CHECK ("approval_policy"."minimum_approvals" >= 1),
	CONSTRAINT "approval_policy_version_chk" CHECK ("approval_policy"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "approval_policy_role" (
	"organization_id" uuid NOT NULL,
	"approval_policy_id" uuid NOT NULL,
	"role_code" varchar(64) NOT NULL,
	CONSTRAINT "approval_policy_role_approval_policy_id_role_code_pk" PRIMARY KEY("approval_policy_id","role_code")
);
--> statement-breakpoint
CREATE TABLE "data_disposition_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"retention_policy_id" uuid NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"status" "workflow_status" DEFAULT 'queued' NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"disposed_count" integer DEFAULT 0 NOT NULL,
	"held_count" integer DEFAULT 0 NOT NULL,
	"manifest_storage_object_id" uuid,
	"manifest_sha256" char(64),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_disposition_run_counts_chk" CHECK ("data_disposition_run"."candidate_count" >= 0 and "data_disposition_run"."disposed_count" >= 0 and "data_disposition_run"."held_count" >= 0 and "data_disposition_run"."disposed_count" + "data_disposition_run"."held_count" <= "data_disposition_run"."candidate_count"),
	CONSTRAINT "data_disposition_run_manifest_sha_chk" CHECK ("data_disposition_run"."manifest_sha256" is null or "data_disposition_run"."manifest_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "legal_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope_type" varchar(64) NOT NULL,
	"scope_id" uuid,
	"reason" text NOT NULL,
	"reference" varchar(255) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_by_membership_id" uuid NOT NULL,
	"released_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_hold_release_chk" CHECK (("legal_hold"."released_at" is null and "legal_hold"."released_by_membership_id" is null) or ("legal_hold"."released_at" is not null and "legal_hold"."released_by_membership_id" is not null and "legal_hold"."released_at" >= "legal_hold"."starts_at"))
);
--> statement-breakpoint
CREATE TABLE "report_bundle_item" (
	"organization_id" uuid NOT NULL,
	"report_bundle_id" uuid NOT NULL,
	"path" varchar(512) NOT NULL,
	"media_type" varchar(255) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"storage_object_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "report_bundle_item_report_bundle_id_path_pk" PRIMARY KEY("report_bundle_id","path"),
	CONSTRAINT "report_bundle_item_size_chk" CHECK ("report_bundle_item"."size_bytes" >= 0),
	CONSTRAINT "report_bundle_item_position_chk" CHECK ("report_bundle_item"."position" >= 0),
	CONSTRAINT "report_bundle_item_sha_chk" CHECK ("report_bundle_item"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "report_bundle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"requested_by_membership_id" uuid NOT NULL,
	"status" "report_status" DEFAULT 'requested' NOT NULL,
	"query_cutoff_at" timestamp with time zone NOT NULL,
	"include_individual_results" boolean DEFAULT false NOT NULL,
	"template_version" varchar(64) NOT NULL,
	"application_release_sha" char(40) NOT NULL,
	"storage_object_id" uuid,
	"bundle_sha256" char(64),
	"manifest" jsonb,
	"manifest_signature" text,
	"signature_algorithm" varchar(32),
	"signing_key_version" varchar(64),
	"retention_mode" "retention_mode",
	"retain_until" timestamp with time zone,
	"object_lock_version_id" varchar(255),
	"workflow_run_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"error_summary" text,
	CONSTRAINT "report_bundle_release_sha_chk" CHECK ("report_bundle"."application_release_sha" ~ '^[0-9a-f]{40}$'),
	CONSTRAINT "report_bundle_hash_chk" CHECK ("report_bundle"."bundle_sha256" is null or "report_bundle"."bundle_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_bundle_signature_chk" CHECK ("report_bundle"."signature_algorithm" is null or "report_bundle"."signature_algorithm" = 'hmac-sha256')
);
--> statement-breakpoint
CREATE TABLE "retention_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"data_class" varchar(64) NOT NULL,
	"version_number" integer NOT NULL,
	"retention_days" integer NOT NULL,
	"retention_mode" "retention_mode" NOT NULL,
	"disposition_action" varchar(16) NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"supersedes_retention_policy_id" uuid,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_policy_version_chk" CHECK ("retention_policy"."version_number" > 0),
	CONSTRAINT "retention_policy_days_chk" CHECK ("retention_policy"."retention_days" > 0),
	CONSTRAINT "retention_policy_action_chk" CHECK ("retention_policy"."disposition_action" in ('delete', 'anonymize', 'retain'))
);
--> statement-breakpoint
CREATE TABLE "claim_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"artifact_version_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"primary_evidence_span_id" uuid NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"load_bearing_score" numeric(5, 4) NOT NULL,
	"load_bearing_rationale" text NOT NULL,
	"review_status" "review_status" DEFAULT 'suggested' NOT NULL,
	"extraction_run_id" uuid,
	"ai_model_run_id" uuid,
	"supersedes_claim_version_id" uuid,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_version_number_chk" CHECK ("claim_version"."version_number" > 0),
	CONSTRAINT "claim_version_confidence_chk" CHECK ("claim_version"."confidence" between 0 and 1),
	CONSTRAINT "claim_version_load_bearing_chk" CHECK ("claim_version"."load_bearing_score" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dependency_edge_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dependency_edge_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid NOT NULL,
	"edge_type" "dependency_edge_type" NOT NULL,
	"evidence_span_id" uuid NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"load_bearing_score" numeric(5, 4) NOT NULL,
	"load_bearing_rationale" text NOT NULL,
	"review_status" "review_status" DEFAULT 'suggested' NOT NULL,
	"extraction_run_id" uuid,
	"ai_model_run_id" uuid,
	"supersedes_edge_version_id" uuid,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dependency_edge_version_nodes_chk" CHECK ("dependency_edge_version"."from_node_id" <> "dependency_edge_version"."to_node_id"),
	CONSTRAINT "dependency_edge_version_number_chk" CHECK ("dependency_edge_version"."version_number" > 0),
	CONSTRAINT "dependency_edge_version_confidence_chk" CHECK ("dependency_edge_version"."confidence" between 0 and 1 and "dependency_edge_version"."load_bearing_score" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "dependency_edge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "graph_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"node_type" "graph_node_type" NOT NULL,
	"source_version_id" uuid,
	"artifact_version_id" uuid,
	"claim_version_id" uuid,
	CONSTRAINT "graph_node_exact_type_chk" CHECK (
      ("graph_node"."node_type" = 'source_version' and "graph_node"."source_version_id" is not null and "graph_node"."artifact_version_id" is null and "graph_node"."claim_version_id" is null) or
      ("graph_node"."node_type" = 'artifact_version' and "graph_node"."source_version_id" is null and "graph_node"."artifact_version_id" is not null and "graph_node"."claim_version_id" is null) or
      ("graph_node"."node_type" = 'claim_version' and "graph_node"."source_version_id" is null and "graph_node"."artifact_version_id" is null and "graph_node"."claim_version_id" is not null)
    )
);
--> statement-breakpoint
CREATE TABLE "role_artifact_exposure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_role_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"evidence_span_id" uuid,
	"confidence" numeric(5, 4) NOT NULL,
	"rationale" text NOT NULL,
	"review_status" "review_status" DEFAULT 'suggested' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"supersedes_exposure_id" uuid,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_artifact_exposure_confidence_chk" CHECK ("role_artifact_exposure"."confidence" between 0 and 1),
	CONSTRAINT "role_artifact_exposure_effective_chk" CHECK ("role_artifact_exposure"."effective_to" is null or "role_artifact_exposure"."effective_to" > "role_artifact_exposure"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "api_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"secret_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"default_timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"locale" varchar(16) DEFAULT 'en' NOT NULL,
	"individual_result_policy" varchar(32) DEFAULT 'aggregate_only' NOT NULL,
	"minimum_aggregate_cohort_size" integer DEFAULT 5 NOT NULL,
	"support_access_requires_tenant_approval" boolean DEFAULT true NOT NULL,
	"review_confidence_threshold" numeric(5, 4) DEFAULT '0.7500' NOT NULL,
	"max_graph_depth" integer DEFAULT 8 NOT NULL,
	"monthly_ai_budget_minor" bigint DEFAULT 0 NOT NULL,
	"max_upload_bytes" bigint DEFAULT 52428800 NOT NULL,
	"updated_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_settings_result_policy_chk" CHECK ("organization_settings"."individual_result_policy" in ('aggregate_only', 'authorized_individual')),
	CONSTRAINT "organization_settings_cohort_size_chk" CHECK ("organization_settings"."minimum_aggregate_cohort_size" >= 2),
	CONSTRAINT "organization_settings_review_threshold_chk" CHECK ("organization_settings"."review_confidence_threshold" between 0 and 1),
	CONSTRAINT "organization_settings_graph_depth_chk" CHECK ("organization_settings"."max_graph_depth" between 1 and 50),
	CONSTRAINT "organization_settings_ai_budget_chk" CHECK ("organization_settings"."monthly_ai_budget_minor" >= 0),
	CONSTRAINT "organization_settings_upload_limit_chk" CHECK ("organization_settings"."max_upload_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"code" varchar(96) PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"configuration_scope" "product_configuration",
	"privileged" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_operator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"operator_role" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deprovisioned_at" timestamp with time zone,
	CONSTRAINT "platform_operator_role_chk" CHECK ("platform_operator"."operator_role" in ('support', 'security_admin'))
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_code" varchar(64) NOT NULL,
	"permission_code" varchar(96) NOT NULL,
	CONSTRAINT "role_permission_role_code_permission_code_pk" PRIMARY KEY("role_code","permission_code")
);
--> statement-breakpoint
CREATE TABLE "service_account_permission" (
	"organization_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"permission_code" varchar(96) NOT NULL,
	"granted_by_membership_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "service_account_permission_service_account_id_permission_code_granted_at_pk" PRIMARY KEY("service_account_id","permission_code","granted_at")
);
--> statement-breakpoint
CREATE TABLE "service_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_access_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"requested_scope" text[] NOT NULL,
	"reason" text NOT NULL,
	"ticket_reference" varchar(255) NOT NULL,
	"approved_by_operator_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"tenant_approved_by_membership_id" uuid,
	"emergency_access" boolean DEFAULT false NOT NULL,
	"emergency_reason" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_access_grant_approver_chk" CHECK ("support_access_grant"."approved_by_operator_id" <> "support_access_grant"."operator_id"),
	CONSTRAINT "support_access_grant_expiry_chk" CHECK ("support_access_grant"."expires_at" > "support_access_grant"."starts_at"),
	CONSTRAINT "support_access_grant_emergency_chk" CHECK (not "support_access_grant"."emergency_access" or "support_access_grant"."emergency_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "integration_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "integration_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "connection_status" DEFAULT 'draft' NOT NULL,
	"external_account_id" varchar(255),
	"credential_reference" text,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"external_event_id" varchar(255) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"payload_sha256" char(64) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" "processing_status" DEFAULT 'queued' NOT NULL,
	"error_summary" text,
	CONSTRAINT "integration_event_payload_sha_chk" CHECK ("integration_event"."payload_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "integration_job_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_job_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"external_key" varchar(255),
	"status" "processing_status" DEFAULT 'queued' NOT NULL,
	"result_object_type" varchar(64),
	"result_object_id" uuid,
	"error_code" varchar(64),
	"error_summary" text,
	"payload_sha256" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_job_item_position_chk" CHECK ("integration_job_item"."position" >= 0),
	CONSTRAINT "integration_job_item_sha_chk" CHECK ("integration_job_item"."payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "integration_job_item_result_chk" CHECK (("integration_job_item"."result_object_type" is null) = ("integration_job_item"."result_object_id" is null))
);
--> statement-breakpoint
CREATE TABLE "integration_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_connection_id" uuid,
	"job_type" varchar(64) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"storage_object_id" uuid,
	"status" "workflow_status" DEFAULT 'queued' NOT NULL,
	"workflow_run_id" uuid,
	"requested_by_membership_id" uuid NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "integration_job_direction_chk" CHECK ("integration_job"."direction" in ('import', 'export')),
	CONSTRAINT "integration_job_counts_chk" CHECK ("integration_job"."total_count" >= 0 and "integration_job"."succeeded_count" >= 0 and "integration_job"."failed_count" >= 0 and "integration_job"."skipped_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"integration_connection_id" uuid,
	"provider_message_id" varchar(255),
	"status" "processing_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_delivery_attempt_chk" CHECK ("notification_delivery"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid,
	"person_id" uuid,
	"notification_category" varchar(64) NOT NULL,
	"channel" varchar(16) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"digest_mode" varchar(16) DEFAULT 'immediate' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_recipient_chk" CHECK (num_nonnulls("notification_preference"."membership_id", "notification_preference"."person_id") = 1),
	CONSTRAINT "notification_preference_digest_chk" CHECK ("notification_preference"."digest_mode" in ('immediate', 'daily', 'none'))
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid,
	"person_id" uuid,
	"type" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body_summary" text NOT NULL,
	"action_path" text NOT NULL,
	"object_type" varchar(64),
	"object_id" uuid,
	"object_version_id" uuid,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_recipient_chk" CHECK (num_nonnulls("notification"."membership_id", "notification"."person_id") = 1),
	CONSTRAINT "notification_action_path_chk" CHECK ("notification"."action_path" like '/%' and "notification"."action_path" not like '//%')
);
--> statement-breakpoint
CREATE TABLE "probe_assessment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"probe_response_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"label" "assessment_label" NOT NULL,
	"source" "assessment_source" NOT NULL,
	"confidence" numeric(5, 4),
	"matched_rationale" text NOT NULL,
	"ambiguity_reason" text,
	"ai_model_run_id" uuid,
	"assessed_by_membership_id" uuid,
	"supersedes_probe_assessment_id" uuid,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "probe_assessment_revision_chk" CHECK ("probe_assessment"."revision" > 0),
	CONSTRAINT "probe_assessment_confidence_chk" CHECK ("probe_assessment"."confidence" is null or "probe_assessment"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "probe_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"case_version_id" uuid NOT NULL,
	"divergence_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"release_batch_id" uuid,
	"recheck_assignment_id" uuid,
	"assignment_kind" varchar(16) NOT NULL,
	"status" "assignment_status" DEFAULT 'assigned' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	CONSTRAINT "probe_assignment_kind_chk" CHECK ("probe_assignment"."assignment_kind" in ('initial', 'recheck_30', 'recheck_90')),
	CONSTRAINT "probe_assignment_recheck_kind_chk" CHECK (("probe_assignment"."assignment_kind" = 'initial' and "probe_assignment"."recheck_assignment_id" is null) or ("probe_assignment"."assignment_kind" <> 'initial' and "probe_assignment"."recheck_assignment_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "probe_delivery_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"probe_assignment_id" uuid NOT NULL,
	"event_type" "delivery_event_type" NOT NULL,
	"channel" varchar(16) NOT NULL,
	"provider_event_id" varchar(255),
	"provider_timestamp" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "probe_delivery_channel_chk" CHECK ("probe_delivery_event"."channel" in ('in_app', 'email', 'slack', 'lms', 'simulated'))
);
--> statement-breakpoint
CREATE TABLE "probe_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"probe_assignment_id" uuid NOT NULL,
	"answer_format" "answer_format" NOT NULL,
	"selected_option_ids" jsonb,
	"free_text_ciphertext" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"client_submission_id" varchar(255) NOT NULL,
	"content_sha256" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "probe_response_probe_assignment_id_unique" UNIQUE("probe_assignment_id"),
	CONSTRAINT "probe_response_payload_chk" CHECK (
      ("probe_response"."answer_format" in ('single_choice', 'multiple_choice') and "probe_response"."selected_option_ids" is not null and "probe_response"."free_text_ciphertext" is null) or
      ("probe_response"."answer_format" = 'free_text' and "probe_response"."selected_option_ids" is null and "probe_response"."free_text_ciphertext" is not null)
    ),
	CONSTRAINT "probe_response_sha_chk" CHECK ("probe_response"."content_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "recheck_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"remediation_assignment_id" uuid NOT NULL,
	"divergence_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"interval_days" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "recheck_status" DEFAULT 'scheduled' NOT NULL,
	"original_case_version_id" uuid NOT NULL,
	"selected_case_version_id" uuid,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recheck_assignment_interval_chk" CHECK ("recheck_assignment"."interval_days" in (30, 90)),
	CONSTRAINT "recheck_assignment_case_chk" CHECK ("recheck_assignment"."selected_case_version_id" is null or "recheck_assignment"."selected_case_version_id" <> "recheck_assignment"."original_case_version_id")
);
--> statement-breakpoint
CREATE TABLE "remediation_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"trigger_probe_assessment_id" uuid NOT NULL,
	"exercise_version_id" uuid NOT NULL,
	"status" "remediation_status" DEFAULT 'assigned' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remediation_assignment_trigger_probe_assessment_id_unique" UNIQUE("trigger_probe_assessment_id")
);
--> statement-breakpoint
CREATE TABLE "remediation_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"remediation_assignment_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"submission_text_ciphertext" text,
	"submission_storage_object_id" uuid,
	"submitted_at" timestamp with time zone NOT NULL,
	"ai_model_run_id" uuid,
	"outcome" varchar(16) NOT NULL,
	"feedback" text NOT NULL,
	"feedback_evidence_span_id" uuid NOT NULL,
	"reviewed_by_membership_id" uuid,
	"assessed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "remediation_attempt_number_chk" CHECK ("remediation_attempt"."attempt_number" > 0),
	CONSTRAINT "remediation_attempt_submission_chk" CHECK (num_nonnulls("remediation_attempt"."submission_text_ciphertext", "remediation_attempt"."submission_storage_object_id") = 1),
	CONSTRAINT "remediation_attempt_outcome_chk" CHECK ("remediation_attempt"."outcome" in ('passed', 'failed', 'needs_review'))
);
--> statement-breakpoint
CREATE TABLE "exercise_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"instructions" text NOT NULL,
	"artifact_kind" "artifact_kind" NOT NULL,
	"starter_content" text,
	"starter_storage_object_id" uuid,
	"answer_format" "answer_format" DEFAULT 'artifact_edit' NOT NULL,
	"grading_rubric" jsonb NOT NULL,
	"new_rule_evidence_span_id" uuid NOT NULL,
	"record_status" "record_status" DEFAULT 'draft' NOT NULL,
	"ai_model_run_id" uuid,
	"supersedes_exercise_version_id" uuid,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_version_number_chk" CHECK ("exercise_version"."version_number" > 0),
	CONSTRAINT "exercise_version_starter_chk" CHECK (num_nonnulls("exercise_version"."starter_content", "exercise_version"."starter_storage_object_id") = 1),
	CONSTRAINT "exercise_version_format_chk" CHECK ("exercise_version"."answer_format" = 'artifact_edit')
);
--> statement-breakpoint
CREATE TABLE "exercise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"divergence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"principal_type" "actor_type" NOT NULL,
	"principal_id" uuid NOT NULL,
	"route_key" varchar(255) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"request_sha256" varchar(64) NOT NULL,
	"status_code" integer,
	"response_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_body" jsonb,
	"object_type" varchar(64),
	"object_id" uuid,
	"locked_until" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "idempotency_record_hash_chk" CHECK ("idempotency_record"."request_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "idempotency_record_expiry_chk" CHECK ("idempotency_record"."expires_at" > "idempotency_record"."created_at")
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category" varchar(32) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" varchar(32) NOT NULL,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subject_type" varchar(64),
	"subject_id" uuid,
	"workflow_run_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_event_cost_chk" CHECK ("usage_event"."cost_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"step_key" varchar(128) NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "workflow_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"error_code" varchar(64),
	"error_summary" text,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_step_attempt_chk" CHECK ("workflow_step"."attempt" > 0)
);
--> statement-breakpoint
CREATE TABLE "cohort_member" (
	"organization_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"added_by_membership_id" uuid NOT NULL,
	CONSTRAINT "cohort_member_cohort_id_person_id_added_at_pk" PRIMARY KEY("cohort_id","person_id","added_at"),
	CONSTRAINT "cohort_member_removed_chk" CHECK ("cohort_member"."removed_at" is null or "cohort_member"."removed_at" > "cohort_member"."added_at")
);
--> statement-breakpoint
CREATE TABLE "cohort" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid,
	"external_person_key" varchar(255),
	"display_name" varchar(255),
	"email" varchar(320),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"is_seeded_persona" boolean DEFAULT false NOT NULL,
	"source_connection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deprovisioned_at" timestamp with time zone,
	CONSTRAINT "person_membership_id_unique" UNIQUE("membership_id")
);
--> statement-breakpoint
CREATE TABLE "person_work_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"work_role_id" uuid NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"source_connection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_work_role_effective_chk" CHECK ("person_work_role"."effective_to" is null or "person_work_role"."effective_to" > "person_work_role"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "work_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_role_key" varchar(255),
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"review_session_id" uuid NOT NULL,
	"review_task_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"resulting_version_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_action_action_chk" CHECK ("review_action"."action" in ('accepted', 'edited', 'rejected', 'deferred', 'human_verified', 'reclassified'))
);
--> statement-breakpoint
CREATE TABLE "review_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"review_task_type" "review_task_type" NOT NULL,
	"corpus_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"items_reviewed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_session_counts_chk" CHECK ("review_session"."active_seconds" >= 0 and "review_session"."items_reviewed" >= 0),
	CONSTRAINT "review_session_end_chk" CHECK ("review_session"."ended_at" is null or "review_session"."ended_at" >= "review_session"."started_at")
);
--> statement-breakpoint
CREATE TABLE "review_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_type" "review_task_type" NOT NULL,
	"status" "review_task_status" DEFAULT 'open' NOT NULL,
	"subject_type" varchar(64) NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version_id" uuid,
	"reason_code" varchar(64) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"assigned_to_membership_id" uuid,
	"due_at" timestamp with time zone,
	"created_by_workflow_run_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_record" DROP CONSTRAINT "approval_record_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "approval_record" DROP CONSTRAINT "approval_record_actor_membership_id_membership_id_fk";
--> statement-breakpoint
ALTER TABLE "approval_record" DROP CONSTRAINT "approval_record_actor_role_code_role_code_fk";
--> statement-breakpoint
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_actor_membership_id_membership_id_fk";
--> statement-breakpoint
ALTER TABLE "outbox_event" DROP CONSTRAINT "outbox_event_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_run" DROP CONSTRAINT "workflow_run_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "membership_role" DROP CONSTRAINT "membership_role_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "membership_role" DROP CONSTRAINT "membership_role_membership_id_membership_id_fk";
--> statement-breakpoint
ALTER TABLE "membership_role" DROP CONSTRAINT "membership_role_role_code_role_code_fk";
--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_organization_id_organization_id_fk";
--> statement-breakpoint
DROP INDEX "membership_organization_idx";--> statement-breakpoint
DROP INDEX "approval_record_object_idx";--> statement-breakpoint
DROP INDEX "approval_record_actor_idx";--> statement-breakpoint
ALTER TABLE "membership_role" DROP CONSTRAINT "membership_role_membership_id_role_code_pk";--> statement-breakpoint
ALTER TABLE "approval_record" ADD COLUMN "approval_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_record" ADD COLUMN "authentication_age_seconds" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "approval_record" ADD COLUMN "mfa_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "actor_type" "actor_type";--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "service_account_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "support_operator_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "request_id" varchar(128);--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "workflow_run_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN "idempotency_key" varchar(255);--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN "trigger_event_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD COLUMN "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_role" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_role" ADD COLUMN "granted_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_role" ADD COLUMN "revoked_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_role" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership_role" ADD COLUMN "revocation_reason" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "last_authenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "status" "entity_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "configuration_scope" "product_configuration";--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "system_defined" boolean DEFAULT true NOT NULL;--> statement-breakpoint
INSERT INTO "organization_settings" (
	"organization_id",
	"individual_result_policy"
)
SELECT
	"id",
	CASE WHEN "individual_results_visible" THEN 'authorized_individual' ELSE 'aggregate_only' END
FROM "organization"
ON CONFLICT ("organization_id") DO NOTHING;--> statement-breakpoint
UPDATE "membership_role"
SET "granted_by_membership_id" = "membership_id"
WHERE "granted_by_membership_id" IS NULL;--> statement-breakpoint
ALTER TABLE "membership_role" ALTER COLUMN "granted_by_membership_id" SET NOT NULL;--> statement-breakpoint
UPDATE "workflow_run"
SET "idempotency_key" = 'legacy:' || "id"::text
WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "workflow_run" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
UPDATE "audit_event"
SET "actor_type" = CASE
	WHEN "actor_membership_id" IS NOT NULL THEN 'membership'::"actor_type"
	ELSE 'system'::"actor_type"
END
WHERE "actor_type" IS NULL;--> statement-breakpoint
ALTER TABLE "audit_event" ALTER COLUMN "actor_type" SET NOT NULL;--> statement-breakpoint
INSERT INTO "approval_policy" (
	"organization_id",
	"object_type",
	"action",
	"minimum_approvals",
	"require_distinct_creator",
	"require_distinct_requester",
	"require_recent_auth",
	"require_mfa",
	"status",
	"version_number",
	"effective_from",
	"created_by_membership_id"
)
SELECT
	"organization_id",
	"object_type",
	"action",
	1,
	false,
	false,
	false,
	false,
	'approved'::"record_status",
	1,
	now(),
	min("actor_membership_id"::text)::uuid
FROM "approval_record"
GROUP BY "organization_id", "object_type", "action"
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "approval_record" ar
SET "approval_policy_id" = ap."id"
FROM "approval_policy" ap
WHERE ar."approval_policy_id" IS NULL
	AND ap."organization_id" = ar."organization_id"
	AND ap."object_type" = ar."object_type"
	AND ap."action" = ar."action"
	AND ap."status" = 'approved';--> statement-breakpoint
ALTER TABLE "approval_record" ALTER COLUMN "approval_policy_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_record" ALTER COLUMN "authentication_age_seconds" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_model_run" ADD CONSTRAINT "ai_model_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_run" ADD CONSTRAINT "ai_model_run_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_run" ADD CONSTRAINT "ai_model_run_extraction_run_id_extraction_run_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."extraction_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_run" ADD CONSTRAINT "ai_model_run_ai_prompt_version_id_ai_prompt_version_id_fk" FOREIGN KEY ("ai_prompt_version_id") REFERENCES "public"."ai_prompt_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_input" ADD CONSTRAINT "ai_run_input_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_input" ADD CONSTRAINT "ai_run_input_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_input" ADD CONSTRAINT "ai_run_input_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_input" ADD CONSTRAINT "ai_run_input_source_version_id_source_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_input" ADD CONSTRAINT "ai_run_input_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_retrieval_chunk" ADD CONSTRAINT "ai_run_retrieval_chunk_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_retrieval_chunk" ADD CONSTRAINT "ai_run_retrieval_chunk_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_retrieval_chunk" ADD CONSTRAINT "ai_run_retrieval_chunk_document_chunk_id_document_chunk_id_fk" FOREIGN KEY ("document_chunk_id") REFERENCES "public"."document_chunk"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_run" ADD CONSTRAINT "extraction_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_run" ADD CONSTRAINT "extraction_run_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_run" ADD CONSTRAINT "extraction_run_corpus_id_corpus_id_fk" FOREIGN KEY ("corpus_id") REFERENCES "public"."corpus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_run" ADD CONSTRAINT "extraction_run_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_retirement" ADD CONSTRAINT "case_retirement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_retirement" ADD CONSTRAINT "case_retirement_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_retirement" ADD CONSTRAINT "case_retirement_retired_by_membership_id_membership_id_fk" FOREIGN KEY ("retired_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_retirement" ADD CONSTRAINT "case_retirement_approval_record_id_approval_record_id_fk" FOREIGN KEY ("approval_record_id") REFERENCES "public"."approval_record"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_version_citation" ADD CONSTRAINT "case_version_citation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_version_citation" ADD CONSTRAINT "case_version_citation_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_version_citation" ADD CONSTRAINT "case_version_citation_source_version_id_source_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_version_citation" ADD CONSTRAINT "case_version_citation_evidence_span_id_evidence_span_id_fk" FOREIGN KEY ("evidence_span_id") REFERENCES "public"."evidence_span"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_divergence_case_id_divergence_case_id_fk" FOREIGN KEY ("divergence_case_id") REFERENCES "public"."divergence_case"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_supersedes_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("supersedes_case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case" ADD CONSTRAINT "divergence_case_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case" ADD CONSTRAINT "divergence_case_divergence_id_divergence_id_fk" FOREIGN KEY ("divergence_id") REFERENCES "public"."divergence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence" ADD CONSTRAINT "divergence_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence" ADD CONSTRAINT "divergence_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence" ADD CONSTRAINT "divergence_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence" ADD CONSTRAINT "divergence_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_batch" ADD CONSTRAINT "release_batch_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_batch" ADD CONSTRAINT "release_batch_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_batch" ADD CONSTRAINT "release_batch_requested_by_membership_id_membership_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_case" ADD CONSTRAINT "release_case_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_case" ADD CONSTRAINT "release_case_release_batch_id_release_batch_id_fk" FOREIGN KEY ("release_batch_id") REFERENCES "public"."release_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_case" ADD CONSTRAINT "release_case_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_exercise" ADD CONSTRAINT "release_exercise_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_exercise" ADD CONSTRAINT "release_exercise_release_batch_id_release_batch_id_fk" FOREIGN KEY ("release_batch_id") REFERENCES "public"."release_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_exercise" ADD CONSTRAINT "release_exercise_exercise_version_id_exercise_version_id_fk" FOREIGN KEY ("exercise_version_id") REFERENCES "public"."exercise_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target_person" ADD CONSTRAINT "release_target_person_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target_person" ADD CONSTRAINT "release_target_person_release_batch_id_release_batch_id_fk" FOREIGN KEY ("release_batch_id") REFERENCES "public"."release_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target_person" ADD CONSTRAINT "release_target_person_release_target_id_release_target_id_fk" FOREIGN KEY ("release_target_id") REFERENCES "public"."release_target"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target_person" ADD CONSTRAINT "release_target_person_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target" ADD CONSTRAINT "release_target_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target" ADD CONSTRAINT "release_target_release_batch_id_release_batch_id_fk" FOREIGN KEY ("release_batch_id") REFERENCES "public"."release_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target" ADD CONSTRAINT "release_target_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target" ADD CONSTRAINT "release_target_work_role_id_work_role_id_fk" FOREIGN KEY ("work_role_id") REFERENCES "public"."work_role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_target" ADD CONSTRAINT "release_target_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_remediation" ADD CONSTRAINT "artifact_remediation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_remediation" ADD CONSTRAINT "artifact_remediation_change_impact_id_change_impact_id_fk" FOREIGN KEY ("change_impact_id") REFERENCES "public"."change_impact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_remediation" ADD CONSTRAINT "artifact_remediation_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_remediation" ADD CONSTRAINT "artifact_remediation_impacted_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("impacted_artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_remediation" ADD CONSTRAINT "artifact_remediation_assigned_to_membership_id_membership_id_fk" FOREIGN KEY ("assigned_to_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_remediation" ADD CONSTRAINT "artifact_remediation_resolved_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("resolved_artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_remediation" ADD CONSTRAINT "artifact_remediation_verified_by_membership_id_membership_id_fk" FOREIGN KEY ("verified_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version_citation" ADD CONSTRAINT "change_event_version_citation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version_citation" ADD CONSTRAINT "change_event_version_citation_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version_citation" ADD CONSTRAINT "change_event_version_citation_source_version_id_source_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version_citation" ADD CONSTRAINT "change_event_version_citation_evidence_span_id_evidence_span_id_fk" FOREIGN KEY ("evidence_span_id") REFERENCES "public"."evidence_span"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_change_event_id_change_event_id_fk" FOREIGN KEY ("change_event_id") REFERENCES "public"."change_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_old_source_version_id_source_version_id_fk" FOREIGN KEY ("old_source_version_id") REFERENCES "public"."source_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_new_source_version_id_source_version_id_fk" FOREIGN KEY ("new_source_version_id") REFERENCES "public"."source_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_entered_by_membership_id_membership_id_fk" FOREIGN KEY ("entered_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_supersedes_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("supersedes_change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event" ADD CONSTRAINT "change_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event" ADD CONSTRAINT "change_event_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact_path_step" ADD CONSTRAINT "change_impact_path_step_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact_path_step" ADD CONSTRAINT "change_impact_path_step_change_impact_path_id_change_impact_path_id_fk" FOREIGN KEY ("change_impact_path_id") REFERENCES "public"."change_impact_path"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact_path_step" ADD CONSTRAINT "change_impact_path_step_graph_node_id_graph_node_id_fk" FOREIGN KEY ("graph_node_id") REFERENCES "public"."graph_node"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact_path_step" ADD CONSTRAINT "change_impact_path_step_dependency_edge_version_id_dependency_edge_version_id_fk" FOREIGN KEY ("dependency_edge_version_id") REFERENCES "public"."dependency_edge_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact_path" ADD CONSTRAINT "change_impact_path_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact_path" ADD CONSTRAINT "change_impact_path_change_impact_id_change_impact_id_fk" FOREIGN KEY ("change_impact_id") REFERENCES "public"."change_impact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_propagation_run_id_propagation_run_id_fk" FOREIGN KEY ("propagation_run_id") REFERENCES "public"."propagation_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_claim_version_id_claim_version_id_fk" FOREIGN KEY ("claim_version_id") REFERENCES "public"."claim_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_work_role_id_work_role_id_fk" FOREIGN KEY ("work_role_id") REFERENCES "public"."work_role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propagation_run" ADD CONSTRAINT "propagation_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propagation_run" ADD CONSTRAINT "propagation_run_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propagation_run" ADD CONSTRAINT "propagation_run_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_owner" ADD CONSTRAINT "artifact_owner_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_owner" ADD CONSTRAINT "artifact_owner_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_owner" ADD CONSTRAINT "artifact_owner_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_supersedes_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("supersedes_artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus" ADD CONSTRAINT "corpus_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus" ADD CONSTRAINT "corpus_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_artifact" ADD CONSTRAINT "corpus_artifact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_artifact" ADD CONSTRAINT "corpus_artifact_corpus_id_corpus_id_fk" FOREIGN KEY ("corpus_id") REFERENCES "public"."corpus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_artifact" ADD CONSTRAINT "corpus_artifact_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_source" ADD CONSTRAINT "corpus_source_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_source" ADD CONSTRAINT "corpus_source_corpus_id_corpus_id_fk" FOREIGN KEY ("corpus_id") REFERENCES "public"."corpus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_source" ADD CONSTRAINT "corpus_source_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_original_storage_object_id_storage_object_id_fk" FOREIGN KEY ("original_storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_extracted_text_storage_object_id_storage_object_id_fk" FOREIGN KEY ("extracted_text_storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_span" ADD CONSTRAINT "evidence_span_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_span" ADD CONSTRAINT "evidence_span_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_span" ADD CONSTRAINT "evidence_span_document_chunk_id_document_chunk_id_fk" FOREIGN KEY ("document_chunk_id") REFERENCES "public"."document_chunk"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_span" ADD CONSTRAINT "evidence_span_verified_by_membership_id_membership_id_fk" FOREIGN KEY ("verified_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_version" ADD CONSTRAINT "source_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_version" ADD CONSTRAINT "source_version_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_version" ADD CONSTRAINT "source_version_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_version" ADD CONSTRAINT "source_version_supersedes_source_version_id_source_version_id_fk" FOREIGN KEY ("supersedes_source_version_id") REFERENCES "public"."source_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_version" ADD CONSTRAINT "source_version_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_object" ADD CONSTRAINT "storage_object_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session" ADD CONSTRAINT "upload_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session" ADD CONSTRAINT "upload_session_requested_by_membership_id_membership_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session" ADD CONSTRAINT "upload_session_storage_object_id_storage_object_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy" ADD CONSTRAINT "approval_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy" ADD CONSTRAINT "approval_policy_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy" ADD CONSTRAINT "approval_policy_supersedes_approval_policy_id_approval_policy_id_fk" FOREIGN KEY ("supersedes_approval_policy_id") REFERENCES "public"."approval_policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_role" ADD CONSTRAINT "approval_policy_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_role" ADD CONSTRAINT "approval_policy_role_approval_policy_id_approval_policy_id_fk" FOREIGN KEY ("approval_policy_id") REFERENCES "public"."approval_policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_role" ADD CONSTRAINT "approval_policy_role_role_code_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."role"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_disposition_run" ADD CONSTRAINT "data_disposition_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_disposition_run" ADD CONSTRAINT "data_disposition_run_retention_policy_id_retention_policy_id_fk" FOREIGN KEY ("retention_policy_id") REFERENCES "public"."retention_policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_disposition_run" ADD CONSTRAINT "data_disposition_run_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_disposition_run" ADD CONSTRAINT "data_disposition_run_manifest_storage_object_id_storage_object_id_fk" FOREIGN KEY ("manifest_storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_hold" ADD CONSTRAINT "legal_hold_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_hold" ADD CONSTRAINT "legal_hold_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_hold" ADD CONSTRAINT "legal_hold_released_by_membership_id_membership_id_fk" FOREIGN KEY ("released_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle_item" ADD CONSTRAINT "report_bundle_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle_item" ADD CONSTRAINT "report_bundle_item_report_bundle_id_report_bundle_id_fk" FOREIGN KEY ("report_bundle_id") REFERENCES "public"."report_bundle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle_item" ADD CONSTRAINT "report_bundle_item_storage_object_id_storage_object_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle" ADD CONSTRAINT "report_bundle_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle" ADD CONSTRAINT "report_bundle_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle" ADD CONSTRAINT "report_bundle_requested_by_membership_id_membership_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle" ADD CONSTRAINT "report_bundle_storage_object_id_storage_object_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle" ADD CONSTRAINT "report_bundle_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policy" ADD CONSTRAINT "retention_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policy" ADD CONSTRAINT "retention_policy_supersedes_retention_policy_id_retention_policy_id_fk" FOREIGN KEY ("supersedes_retention_policy_id") REFERENCES "public"."retention_policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policy" ADD CONSTRAINT "retention_policy_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_primary_evidence_span_id_evidence_span_id_fk" FOREIGN KEY ("primary_evidence_span_id") REFERENCES "public"."evidence_span"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_extraction_run_id_extraction_run_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."extraction_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_supersedes_claim_version_id_claim_version_id_fk" FOREIGN KEY ("supersedes_claim_version_id") REFERENCES "public"."claim_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_dependency_edge_id_dependency_edge_id_fk" FOREIGN KEY ("dependency_edge_id") REFERENCES "public"."dependency_edge"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_from_node_id_graph_node_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."graph_node"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_to_node_id_graph_node_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."graph_node"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_evidence_span_id_evidence_span_id_fk" FOREIGN KEY ("evidence_span_id") REFERENCES "public"."evidence_span"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_extraction_run_id_extraction_run_id_fk" FOREIGN KEY ("extraction_run_id") REFERENCES "public"."extraction_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_supersedes_edge_version_id_dependency_edge_version_id_fk" FOREIGN KEY ("supersedes_edge_version_id") REFERENCES "public"."dependency_edge_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge" ADD CONSTRAINT "dependency_edge_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node" ADD CONSTRAINT "graph_node_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node" ADD CONSTRAINT "graph_node_source_version_id_source_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node" ADD CONSTRAINT "graph_node_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node" ADD CONSTRAINT "graph_node_claim_version_id_claim_version_id_fk" FOREIGN KEY ("claim_version_id") REFERENCES "public"."claim_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_work_role_id_work_role_id_fk" FOREIGN KEY ("work_role_id") REFERENCES "public"."work_role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_evidence_span_id_evidence_span_id_fk" FOREIGN KEY ("evidence_span_id") REFERENCES "public"."evidence_span"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_supersedes_exposure_id_role_artifact_exposure_id_fk" FOREIGN KEY ("supersedes_exposure_id") REFERENCES "public"."role_artifact_exposure"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credential" ADD CONSTRAINT "api_credential_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credential" ADD CONSTRAINT "api_credential_service_account_id_service_account_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_updated_by_membership_id_membership_id_fk" FOREIGN KEY ("updated_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_code_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."role"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_code_permission_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permission"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account_permission" ADD CONSTRAINT "service_account_permission_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account_permission" ADD CONSTRAINT "service_account_permission_service_account_id_service_account_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account_permission" ADD CONSTRAINT "service_account_permission_permission_code_permission_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permission"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account_permission" ADD CONSTRAINT "service_account_permission_granted_by_membership_id_membership_id_fk" FOREIGN KEY ("granted_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account" ADD CONSTRAINT "service_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account" ADD CONSTRAINT "service_account_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grant" ADD CONSTRAINT "support_access_grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grant" ADD CONSTRAINT "support_access_grant_operator_id_platform_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."platform_operator"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grant" ADD CONSTRAINT "support_access_grant_approved_by_operator_id_platform_operator_id_fk" FOREIGN KEY ("approved_by_operator_id") REFERENCES "public"."platform_operator"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grant" ADD CONSTRAINT "support_access_grant_tenant_approved_by_membership_id_membership_id_fk" FOREIGN KEY ("tenant_approved_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grant" ADD CONSTRAINT "support_access_grant_revoked_by_operator_id_platform_operator_id_fk" FOREIGN KEY ("revoked_by_operator_id") REFERENCES "public"."platform_operator"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_event" ADD CONSTRAINT "integration_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_event" ADD CONSTRAINT "integration_event_integration_connection_id_integration_connection_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_job_item" ADD CONSTRAINT "integration_job_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_job_item" ADD CONSTRAINT "integration_job_item_integration_job_id_integration_job_id_fk" FOREIGN KEY ("integration_job_id") REFERENCES "public"."integration_job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_job" ADD CONSTRAINT "integration_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_job" ADD CONSTRAINT "integration_job_integration_connection_id_integration_connection_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_job" ADD CONSTRAINT "integration_job_storage_object_id_storage_object_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_job" ADD CONSTRAINT "integration_job_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_job" ADD CONSTRAINT "integration_job_requested_by_membership_id_membership_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_integration_connection_id_integration_connection_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assessment" ADD CONSTRAINT "probe_assessment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assessment" ADD CONSTRAINT "probe_assessment_probe_response_id_probe_response_id_fk" FOREIGN KEY ("probe_response_id") REFERENCES "public"."probe_response"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assessment" ADD CONSTRAINT "probe_assessment_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assessment" ADD CONSTRAINT "probe_assessment_assessed_by_membership_id_membership_id_fk" FOREIGN KEY ("assessed_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assessment" ADD CONSTRAINT "probe_assessment_supersedes_probe_assessment_id_probe_assessment_id_fk" FOREIGN KEY ("supersedes_probe_assessment_id") REFERENCES "public"."probe_assessment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_divergence_id_divergence_id_fk" FOREIGN KEY ("divergence_id") REFERENCES "public"."divergence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_release_batch_id_release_batch_id_fk" FOREIGN KEY ("release_batch_id") REFERENCES "public"."release_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_recheck_assignment_id_recheck_assignment_id_fk" FOREIGN KEY ("recheck_assignment_id") REFERENCES "public"."recheck_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_delivery_event" ADD CONSTRAINT "probe_delivery_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_delivery_event" ADD CONSTRAINT "probe_delivery_event_probe_assignment_id_probe_assignment_id_fk" FOREIGN KEY ("probe_assignment_id") REFERENCES "public"."probe_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_response" ADD CONSTRAINT "probe_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_response" ADD CONSTRAINT "probe_response_probe_assignment_id_probe_assignment_id_fk" FOREIGN KEY ("probe_assignment_id") REFERENCES "public"."probe_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_remediation_assignment_id_remediation_assignment_id_fk" FOREIGN KEY ("remediation_assignment_id") REFERENCES "public"."remediation_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_divergence_id_divergence_id_fk" FOREIGN KEY ("divergence_id") REFERENCES "public"."divergence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_original_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("original_case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_selected_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("selected_case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_assignment" ADD CONSTRAINT "remediation_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_assignment" ADD CONSTRAINT "remediation_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_assignment" ADD CONSTRAINT "remediation_assignment_trigger_probe_assessment_id_probe_assessment_id_fk" FOREIGN KEY ("trigger_probe_assessment_id") REFERENCES "public"."probe_assessment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_assignment" ADD CONSTRAINT "remediation_assignment_exercise_version_id_exercise_version_id_fk" FOREIGN KEY ("exercise_version_id") REFERENCES "public"."exercise_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_attempt" ADD CONSTRAINT "remediation_attempt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_attempt" ADD CONSTRAINT "remediation_attempt_remediation_assignment_id_remediation_assignment_id_fk" FOREIGN KEY ("remediation_assignment_id") REFERENCES "public"."remediation_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_attempt" ADD CONSTRAINT "remediation_attempt_submission_storage_object_id_storage_object_id_fk" FOREIGN KEY ("submission_storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_attempt" ADD CONSTRAINT "remediation_attempt_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_attempt" ADD CONSTRAINT "remediation_attempt_feedback_evidence_span_id_evidence_span_id_fk" FOREIGN KEY ("feedback_evidence_span_id") REFERENCES "public"."evidence_span"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_attempt" ADD CONSTRAINT "remediation_attempt_reviewed_by_membership_id_membership_id_fk" FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_starter_storage_object_id_storage_object_id_fk" FOREIGN KEY ("starter_storage_object_id") REFERENCES "public"."storage_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_new_rule_evidence_span_id_evidence_span_id_fk" FOREIGN KEY ("new_rule_evidence_span_id") REFERENCES "public"."evidence_span"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_ai_model_run_id_ai_model_run_id_fk" FOREIGN KEY ("ai_model_run_id") REFERENCES "public"."ai_model_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_supersedes_exercise_version_id_exercise_version_id_fk" FOREIGN KEY ("supersedes_exercise_version_id") REFERENCES "public"."exercise_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_divergence_id_divergence_id_fk" FOREIGN KEY ("divergence_id") REFERENCES "public"."divergence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_member" ADD CONSTRAINT "cohort_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_member" ADD CONSTRAINT "cohort_member_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_member" ADD CONSTRAINT "cohort_member_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_member" ADD CONSTRAINT "cohort_member_added_by_membership_id_membership_id_fk" FOREIGN KEY ("added_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort" ADD CONSTRAINT "cohort_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort" ADD CONSTRAINT "cohort_created_by_membership_id_membership_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_source_connection_id_integration_connection_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_work_role" ADD CONSTRAINT "person_work_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_work_role" ADD CONSTRAINT "person_work_role_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_work_role" ADD CONSTRAINT "person_work_role_work_role_id_work_role_id_fk" FOREIGN KEY ("work_role_id") REFERENCES "public"."work_role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_work_role" ADD CONSTRAINT "person_work_role_source_connection_id_integration_connection_id_fk" FOREIGN KEY ("source_connection_id") REFERENCES "public"."integration_connection"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_role" ADD CONSTRAINT "work_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_action" ADD CONSTRAINT "review_action_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_action" ADD CONSTRAINT "review_action_review_session_id_review_session_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_action" ADD CONSTRAINT "review_action_review_task_id_review_task_id_fk" FOREIGN KEY ("review_task_id") REFERENCES "public"."review_task"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_corpus_id_corpus_id_fk" FOREIGN KEY ("corpus_id") REFERENCES "public"."corpus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_assigned_to_membership_id_membership_id_fk" FOREIGN KEY ("assigned_to_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_created_by_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("created_by_workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_run_external_response_uq" ON "ai_model_run" USING btree ("provider","external_response_id") WHERE "ai_model_run"."external_response_id" is not null;--> statement-breakpoint
CREATE INDEX "ai_model_run_subject_idx" ON "ai_model_run" USING btree ("organization_id","subject_type","subject_id","subject_version_id");--> statement-breakpoint
CREATE INDEX "ai_model_run_cost_period_idx" ON "ai_model_run" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_version_contract_uq" ON "ai_prompt_version" USING btree ("task_type","prompt_version","schema_version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_run_retrieval_rank_uq" ON "ai_run_retrieval_chunk" USING btree ("ai_model_run_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_run_cache_uq" ON "extraction_run" USING btree ("organization_id","cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "divergence_case_version_number_uq" ON "divergence_case_version" USING btree ("divergence_case_id","version_number");--> statement-breakpoint
CREATE INDEX "divergence_change_idx" ON "divergence" USING btree ("organization_id","change_event_version_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "release_batch_idempotency_uq" ON "release_batch" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "release_batch_status_idx" ON "release_batch" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "release_target_person_batch_idx" ON "release_target_person" USING btree ("release_batch_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_target_person_uq" ON "release_target" USING btree ("release_batch_id","person_id") WHERE "release_target"."person_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "release_target_role_uq" ON "release_target" USING btree ("release_batch_id","work_role_id") WHERE "release_target"."work_role_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "release_target_cohort_uq" ON "release_target" USING btree ("release_batch_id","cohort_id") WHERE "release_target"."cohort_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_remediation_impact_artifact_uq" ON "artifact_remediation" USING btree ("change_impact_id","artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_remediation_queue_idx" ON "artifact_remediation" USING btree ("organization_id","assigned_to_membership_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "change_event_version_number_uq" ON "change_event_version" USING btree ("change_event_id","version_number");--> statement-breakpoint
CREATE INDEX "change_event_source_idx" ON "change_event" USING btree ("organization_id","source_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "change_impact_path_rank_uq" ON "change_impact_path" USING btree ("change_impact_id","path_rank");--> statement-breakpoint
CREATE INDEX "change_impact_class_idx" ON "change_impact" USING btree ("organization_id","change_event_version_id","impact_class");--> statement-breakpoint
CREATE UNIQUE INDEX "change_impact_claim_uq" ON "change_impact" USING btree ("propagation_run_id","claim_version_id") WHERE "change_impact"."claim_version_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "change_impact_artifact_uq" ON "change_impact" USING btree ("propagation_run_id","artifact_version_id") WHERE "change_impact"."artifact_version_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "change_impact_role_uq" ON "change_impact" USING btree ("propagation_run_id","work_role_id") WHERE "change_impact"."work_role_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "change_impact_person_uq" ON "change_impact" USING btree ("propagation_run_id","person_id") WHERE "change_impact"."person_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "propagation_run_idempotency_uq" ON "propagation_run" USING btree ("change_event_version_id","graph_cutoff_at","algorithm_version");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_owner_active_uq" ON "artifact_owner" USING btree ("artifact_id","membership_id","owner_type") WHERE "artifact_owner"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_version_number_uq" ON "artifact_version" USING btree ("artifact_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_version_current_uq" ON "artifact_version" USING btree ("artifact_id") WHERE "artifact_version"."record_status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_external_reference_uq" ON "artifact" USING btree ("organization_id","external_reference") WHERE "artifact"."external_reference" is not null;--> statement-breakpoint
CREATE INDEX "artifact_kind_idx" ON "artifact" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "corpus_active_name_uq" ON "corpus" USING btree ("organization_id","name") WHERE "corpus"."status" <> 'retired';--> statement-breakpoint
CREATE UNIQUE INDEX "corpus_artifact_active_uq" ON "corpus_artifact" USING btree ("corpus_id","artifact_id") WHERE "corpus_artifact"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "corpus_source_active_uq" ON "corpus_source" USING btree ("corpus_id","source_id") WHERE "corpus_source"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunk_position_uq" ON "document_chunk" USING btree ("document_version_id","position");--> statement-breakpoint
CREATE INDEX "document_chunk_document_idx" ON "document_chunk" USING btree ("organization_id","document_version_id");--> statement-breakpoint
CREATE INDEX "document_chunk_search_idx" ON "document_chunk" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "document_chunk_embedding_idx" ON "document_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_cache_uq" ON "document_version" USING btree ("organization_id","content_sha256","parser_name","parser_version");--> statement-breakpoint
CREATE INDEX "document_version_processing_idx" ON "document_version" USING btree ("organization_id","processing_status","created_at");--> statement-breakpoint
CREATE INDEX "evidence_span_offsets_idx" ON "evidence_span" USING btree ("document_version_id","start_offset","end_offset");--> statement-breakpoint
CREATE UNIQUE INDEX "source_version_number_uq" ON "source_version" USING btree ("source_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "source_version_label_uq" ON "source_version" USING btree ("source_id","version_label");--> statement-breakpoint
CREATE UNIQUE INDEX "source_version_current_uq" ON "source_version" USING btree ("source_id") WHERE "source_version"."record_status" = 'approved' and "source_version"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "source_canonical_reference_uq" ON "source" USING btree ("organization_id","canonical_reference") WHERE "source"."canonical_reference" is not null;--> statement-breakpoint
CREATE INDEX "source_title_idx" ON "source" USING btree ("organization_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_object_location_uq" ON "storage_object" USING btree ("provider","bucket_alias","object_key");--> statement-breakpoint
CREATE INDEX "storage_object_hash_idx" ON "storage_object" USING btree ("organization_id","sha256");--> statement-breakpoint
CREATE INDEX "storage_object_retention_idx" ON "storage_object" USING btree ("organization_id","retention_until");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_session_idempotency_uq" ON "upload_session" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "upload_session_expired_idx" ON "upload_session" USING btree ("organization_id","expires_at") WHERE "upload_session"."completed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_policy_active_uq" ON "approval_policy" USING btree ("organization_id","object_type","action") WHERE "approval_policy"."status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "approval_policy_version_uq" ON "approval_policy" USING btree ("organization_id","object_type","action","version_number");--> statement-breakpoint
CREATE INDEX "legal_hold_active_scope_idx" ON "legal_hold" USING btree ("organization_id","scope_type","scope_id") WHERE "legal_hold"."released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "report_bundle_item_position_uq" ON "report_bundle_item" USING btree ("report_bundle_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "report_bundle_idempotency_uq" ON "report_bundle" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "report_bundle_change_status_idx" ON "report_bundle" USING btree ("organization_id","change_event_version_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_policy_version_uq" ON "retention_policy" USING btree ("organization_id","data_class","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_policy_active_uq" ON "retention_policy" USING btree ("organization_id","data_class") WHERE "retention_policy"."status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "claim_version_number_uq" ON "claim_version" USING btree ("claim_id","version_number");--> statement-breakpoint
CREATE INDEX "claim_version_artifact_idx" ON "claim_version" USING btree ("organization_id","artifact_version_id");--> statement-breakpoint
CREATE INDEX "claim_version_review_idx" ON "claim_version" USING btree ("organization_id","review_status","created_at");--> statement-breakpoint
CREATE INDEX "claim_artifact_idx" ON "claim" USING btree ("organization_id","artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_edge_version_number_uq" ON "dependency_edge_version" USING btree ("dependency_edge_id","version_number");--> statement-breakpoint
CREATE INDEX "dependency_edge_version_from_idx" ON "dependency_edge_version" USING btree ("organization_id","from_node_id","edge_type");--> statement-breakpoint
CREATE INDEX "dependency_edge_version_to_idx" ON "dependency_edge_version" USING btree ("organization_id","to_node_id","edge_type");--> statement-breakpoint
CREATE INDEX "dependency_edge_version_review_idx" ON "dependency_edge_version" USING btree ("organization_id","review_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_node_source_version_uq" ON "graph_node" USING btree ("source_version_id") WHERE "graph_node"."source_version_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "graph_node_artifact_version_uq" ON "graph_node" USING btree ("artifact_version_id") WHERE "graph_node"."artifact_version_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "graph_node_claim_version_uq" ON "graph_node" USING btree ("claim_version_id") WHERE "graph_node"."claim_version_id" is not null;--> statement-breakpoint
CREATE INDEX "graph_node_type_idx" ON "graph_node" USING btree ("organization_id","node_type");--> statement-breakpoint
CREATE UNIQUE INDEX "role_artifact_exposure_active_uq" ON "role_artifact_exposure" USING btree ("work_role_id","artifact_id") WHERE "role_artifact_exposure"."review_status" = 'accepted' and "role_artifact_exposure"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "api_credential_secret_hash_uq" ON "api_credential" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "api_credential_active_idx" ON "api_credential" USING btree ("service_account_id","expires_at") WHERE "api_credential"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_operator_workos_user_uq" ON "platform_operator" USING btree ("workos_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_account_permission_active_uq" ON "service_account_permission" USING btree ("service_account_id","permission_code") WHERE "service_account_permission"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "service_account_active_name_uq" ON "service_account" USING btree ("organization_id","name") WHERE "service_account"."status" <> 'retired';--> statement-breakpoint
CREATE INDEX "support_access_grant_active_idx" ON "support_access_grant" USING btree ("organization_id","expires_at") WHERE "support_access_grant"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connection_active_name_uq" ON "integration_connection" USING btree ("organization_id","type","name") WHERE "integration_connection"."status" <> 'disabled';--> statement-breakpoint
CREATE UNIQUE INDEX "integration_event_external_uq" ON "integration_event" USING btree ("integration_connection_id","external_event_id");--> statement-breakpoint
CREATE INDEX "integration_event_queue_idx" ON "integration_event" USING btree ("organization_id","status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_job_item_position_uq" ON "integration_job_item" USING btree ("integration_job_id","position");--> statement-breakpoint
CREATE INDEX "integration_job_item_failed_idx" ON "integration_job_item" USING btree ("organization_id","integration_job_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_provider_message_uq" ON "notification_delivery" USING btree ("channel","provider_message_id") WHERE "notification_delivery"."provider_message_id" is not null;--> statement-breakpoint
CREATE INDEX "notification_delivery_retry_idx" ON "notification_delivery" USING btree ("organization_id","status","last_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_membership_uq" ON "notification_preference" USING btree ("membership_id","notification_category","channel") WHERE "notification_preference"."membership_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_person_uq" ON "notification_preference" USING btree ("person_id","notification_category","channel") WHERE "notification_preference"."person_id" is not null;--> statement-breakpoint
CREATE INDEX "notification_membership_unread_idx" ON "notification" USING btree ("organization_id","membership_id","created_at") WHERE "notification"."read_at" is null and "notification"."dismissed_at" is null;--> statement-breakpoint
CREATE INDEX "notification_person_unread_idx" ON "notification" USING btree ("organization_id","person_id","created_at") WHERE "notification"."read_at" is null and "notification"."dismissed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "probe_assessment_revision_uq" ON "probe_assessment" USING btree ("probe_response_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "probe_assessment_successor_uq" ON "probe_assessment" USING btree ("supersedes_probe_assessment_id") WHERE "probe_assessment"."supersedes_probe_assessment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "probe_assignment_idempotency_uq" ON "probe_assignment" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "probe_assignment_recheck_uq" ON "probe_assignment" USING btree ("recheck_assignment_id") WHERE "probe_assignment"."recheck_assignment_id" is not null;--> statement-breakpoint
CREATE INDEX "probe_assignment_person_queue_idx" ON "probe_assignment" USING btree ("organization_id","person_id","status","due_at");--> statement-breakpoint
CREATE INDEX "probe_assignment_change_idx" ON "probe_assignment" USING btree ("organization_id","change_event_version_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "probe_delivery_provider_event_uq" ON "probe_delivery_event" USING btree ("channel","provider_event_id") WHERE "probe_delivery_event"."provider_event_id" is not null;--> statement-breakpoint
CREATE INDEX "probe_delivery_timeline_idx" ON "probe_delivery_event" USING btree ("organization_id","probe_assignment_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "probe_response_client_submission_uq" ON "probe_response" USING btree ("organization_id","client_submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recheck_assignment_interval_uq" ON "recheck_assignment" USING btree ("remediation_assignment_id","interval_days");--> statement-breakpoint
CREATE INDEX "recheck_assignment_due_idx" ON "recheck_assignment" USING btree ("organization_id","status","due_at");--> statement-breakpoint
CREATE INDEX "remediation_assignment_person_queue_idx" ON "remediation_assignment" USING btree ("organization_id","person_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "remediation_attempt_number_uq" ON "remediation_attempt" USING btree ("remediation_assignment_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_version_number_uq" ON "exercise_version" USING btree ("exercise_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_record_scope_uq" ON "idempotency_record" USING btree ("organization_id","principal_type","principal_id","route_key","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_record_expiry_idx" ON "idempotency_record" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "usage_event_timeline_idx" ON "usage_event" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_event_category_period_idx" ON "usage_event" USING btree ("organization_id","category","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_step_attempt_uq" ON "workflow_step" USING btree ("workflow_run_id","step_key","attempt");--> statement-breakpoint
CREATE INDEX "workflow_step_active_idx" ON "workflow_step" USING btree ("organization_id","status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_member_active_uq" ON "cohort_member" USING btree ("cohort_id","person_id") WHERE "cohort_member"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_active_name_uq" ON "cohort" USING btree ("organization_id","name") WHERE "cohort"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "person_external_key_uq" ON "person" USING btree ("organization_id","external_person_key") WHERE "person"."external_person_key" is not null;--> statement-breakpoint
CREATE INDEX "person_organization_status_idx" ON "person" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "person_work_role_active_uq" ON "person_work_role" USING btree ("person_id","work_role_id") WHERE "person_work_role"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "work_role_active_name_uq" ON "work_role" USING btree ("organization_id","name") WHERE "work_role"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "work_role_external_key_uq" ON "work_role" USING btree ("organization_id","external_role_key") WHERE "work_role"."external_role_key" is not null;--> statement-breakpoint
CREATE INDEX "review_action_task_idx" ON "review_action" USING btree ("organization_id","review_task_id","created_at");--> statement-breakpoint
CREATE INDEX "review_action_session_idx" ON "review_action" USING btree ("organization_id","review_session_id","created_at");--> statement-breakpoint
CREATE INDEX "review_session_corpus_idx" ON "review_session" USING btree ("organization_id","corpus_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_task_open_subject_uq" ON "review_task" USING btree ("organization_id","task_type","subject_type","subject_id","subject_version_id") WHERE "review_task"."status" in ('open', 'assigned', 'in_progress');--> statement-breakpoint
CREATE INDEX "review_task_queue_idx" ON "review_task" USING btree ("organization_id","status","priority","created_at");--> statement-breakpoint
CREATE INDEX "review_task_assignee_idx" ON "review_task" USING btree ("organization_id","assigned_to_membership_id","status");--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_approval_policy_id_approval_policy_id_fk" FOREIGN KEY ("approval_policy_id") REFERENCES "public"."approval_policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_actor_membership_id_membership_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_actor_role_code_role_code_fk" FOREIGN KEY ("actor_role_code") REFERENCES "public"."role"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_service_account_id_service_account_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_support_operator_id_platform_operator_id_fk" FOREIGN KEY ("support_operator_id") REFERENCES "public"."platform_operator"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_membership_id_membership_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_granted_by_membership_id_membership_id_fk" FOREIGN KEY ("granted_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_revoked_by_membership_id_membership_id_fk" FOREIGN KEY ("revoked_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_role_code_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."role"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_record_actor_requirement_uq" ON "approval_record" USING btree ("approval_policy_id","object_version_id","action","actor_membership_id");--> statement-breakpoint
CREATE INDEX "audit_event_object_idx" ON "audit_event" USING btree ("organization_id","object_type","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_idempotency_uq" ON "workflow_run" USING btree ("organization_id","workflow_name","idempotency_key");--> statement-breakpoint
CREATE INDEX "workflow_run_stale_idx" ON "workflow_run" USING btree ("organization_id","status","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_role_active_uq" ON "membership_role" USING btree ("membership_id","role_code") WHERE "membership_role"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "membership_organization_status_idx" ON "membership" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "organization_configuration_status_idx" ON "organization" USING btree ("product_configuration","status");--> statement-breakpoint
CREATE INDEX "approval_record_object_idx" ON "approval_record" USING btree ("organization_id","object_type","object_id","created_at");--> statement-breakpoint
CREATE INDEX "approval_record_actor_idx" ON "approval_record" USING btree ("organization_id","actor_membership_id","created_at");--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "individual_results_visible";--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_auth_age_chk" CHECK ("approval_record"."authentication_age_seconds" >= 0);--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_chk" CHECK (
      ("audit_event"."actor_type" = 'membership' and "audit_event"."actor_membership_id" is not null and "audit_event"."service_account_id" is null and "audit_event"."support_operator_id" is null) or
      ("audit_event"."actor_type" = 'service_account' and "audit_event"."actor_membership_id" is null and "audit_event"."service_account_id" is not null and "audit_event"."support_operator_id" is null) or
      ("audit_event"."actor_type" = 'support_operator' and "audit_event"."actor_membership_id" is null and "audit_event"."service_account_id" is null and "audit_event"."support_operator_id" is not null) or
      ("audit_event"."actor_type" = 'system' and "audit_event"."actor_membership_id" is null and "audit_event"."service_account_id" is null and "audit_event"."support_operator_id" is null)
    );--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_attempts_chk" CHECK ("outbox_event"."attempts" >= 0);--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_progress_chk" CHECK ("workflow_run"."progress_current" >= 0 and ("workflow_run"."progress_total" is null or "workflow_run"."progress_total" >= "workflow_run"."progress_current"));--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_attempt_chk" CHECK ("workflow_run"."attempt" > 0);--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_revocation_chk" CHECK (("membership_role"."revoked_at" is null and "membership_role"."revoked_by_membership_id" is null) or ("membership_role"."revoked_at" is not null and "membership_role"."revoked_by_membership_id" is not null));
