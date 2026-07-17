CREATE TYPE "public"."artifact_kind" AS ENUM('protocol', 'course', 'claim_library_entry', 'decision_doc', 'marketing_material');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('draft', 'approved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('assigned', 'opened', 'completed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."edge_kind" AS ENUM('supports', 'depends_on', 'contradicts', 'mentions', 'acts_on');--> statement-breakpoint
CREATE TYPE "public"."impact_kind" AS ENUM('load_bearing', 'peripheral', 'person_exposure');--> statement-breakpoint
CREATE TYPE "public"."probe_answer" AS ENUM('old', 'new', 'other');--> statement-breakpoint
CREATE TYPE "public"."recheck_status" AS ENUM('scheduled', 'assigned', 'completed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."remediation_status" AS ENUM('assigned', 'in_progress', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('suggested', 'needs_review', 'reviewed', 'rejected', 'retired');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('guideline', 'regulation', 'paper', 'standard', 'internal_policy');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'superseded', 'retracted', 'corrected');--> statement-breakpoint
CREATE TABLE "artifact_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"version_label" varchar(128) NOT NULL,
	"body_text" text NOT NULL,
	"storage_object_key" text,
	"file_sha256" varchar(64) NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "artifact_kind" NOT NULL,
	"owner_membership_id" uuid,
	"canonical_key" varchar(160) NOT NULL,
	"title" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artifact_version_id" uuid,
	"source_version_id" uuid,
	"chunk_ordinal" integer NOT NULL,
	"page_label" varchar(64),
	"section_label" varchar(255),
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"text" text NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"embedding_model" varchar(128),
	"search_vector" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_chunk_exactly_one_parent" CHECK (("document_chunk"."artifact_version_id" IS NOT NULL) <> ("document_chunk"."source_version_id" IS NOT NULL)),
	CONSTRAINT "document_chunk_offsets_order" CHECK ("document_chunk"."start_offset" < "document_chunk"."end_offset")
);
--> statement-breakpoint
CREATE TABLE "organization_domain_policy" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"graph_max_depth" integer DEFAULT 8 NOT NULL,
	"extraction_auto_review_threshold" numeric(4, 3) DEFAULT '0.800' NOT NULL,
	"rewrite_required_threshold" numeric(4, 3) DEFAULT '0.650' NOT NULL,
	"aggregate_cohort_minimum" integer DEFAULT 5 NOT NULL,
	"sod_scope" varchar(32) DEFAULT 'per_object' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid,
	"external_key" varchar(128) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"role_code" varchar(64) NOT NULL,
	"is_seeded_persona" boolean DEFAULT false NOT NULL,
	"response_pattern" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"version_label" varchar(128) NOT NULL,
	"status" "source_status" NOT NULL,
	"effective_date" date NOT NULL,
	"storage_object_key" text,
	"file_sha256" varchar(64) NOT NULL,
	"summary" text NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"canonical_key" varchar(160) NOT NULL,
	"title" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"version_label" varchar(128) NOT NULL,
	"text" text NOT NULL,
	"evidence_quote" text NOT NULL,
	"evidence_page" varchar(64),
	"evidence_section" varchar(255),
	"evidence_start_offset" integer NOT NULL,
	"evidence_end_offset" integer NOT NULL,
	"evidence_checksum" varchar(64) NOT NULL,
	"extraction_run_id" varchar(128) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"model_id" varchar(128) NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"load_bearing_score" numeric(4, 3) NOT NULL,
	"load_bearing_rationale" text NOT NULL,
	"review_status" "review_status" DEFAULT 'suggested' NOT NULL,
	"reviewed_by_membership_id" uuid,
	"locked_at" timestamp with time zone,
	"locked_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_version_confidence_range" CHECK ("claim_version"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "claim_version_load_bearing_range" CHECK ("claim_version"."load_bearing_score" BETWEEN 0 AND 1),
	CONSTRAINT "claim_version_evidence_offsets_order" CHECK ("claim_version"."evidence_start_offset" < "claim_version"."evidence_end_offset")
);
--> statement-breakpoint
CREATE TABLE "claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artifact_version_id" uuid NOT NULL,
	"canonical_key" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dependency_edge_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"edge_id" uuid NOT NULL,
	"version_label" varchar(128) NOT NULL,
	"evidence_document_version_id" uuid NOT NULL,
	"evidence_quote" text NOT NULL,
	"evidence_start_offset" integer NOT NULL,
	"evidence_end_offset" integer NOT NULL,
	"evidence_checksum" varchar(64) NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"review_status" "review_status" DEFAULT 'suggested' NOT NULL,
	"reviewed_by_membership_id" uuid,
	"locked_at" timestamp with time zone,
	"locked_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dependency_edge_version_confidence_range" CHECK ("dependency_edge_version"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "dependency_edge_version_offsets_order" CHECK ("dependency_edge_version"."evidence_start_offset" < "dependency_edge_version"."evidence_end_offset")
);
--> statement-breakpoint
CREATE TABLE "dependency_edge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "edge_kind" NOT NULL,
	"from_object_type" varchar(48) NOT NULL,
	"from_object_id" uuid NOT NULL,
	"to_object_type" varchar(48) NOT NULL,
	"to_object_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_artifact_exposure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"role_code" varchar(64) NOT NULL,
	"artifact_version_id" uuid NOT NULL,
	"rationale" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_artifact_exposure_confidence_range" CHECK ("role_artifact_exposure"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "claim_source_support" (
	"claim_version_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_event_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_id" uuid NOT NULL,
	"old_source_version_id" uuid NOT NULL,
	"new_source_version_id" uuid NOT NULL,
	"version_label" varchar(128) NOT NULL,
	"old_rule" text NOT NULL,
	"new_rule" text NOT NULL,
	"affected_population" text NOT NULL,
	"diff_summary" jsonb NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_event_version_sources_distinct" CHECK ("change_event_version"."old_source_version_id" <> "change_event_version"."new_source_version_id")
);
--> statement-breakpoint
CREATE TABLE "change_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"entered_by_membership_id" uuid NOT NULL,
	"validated_by_membership_id" uuid,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_event_validator_distinct" CHECK ("change_event"."validated_by_membership_id" IS NULL OR "change_event"."entered_by_membership_id" <> "change_event"."validated_by_membership_id")
);
--> statement-breakpoint
CREATE TABLE "change_impact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"impacted_object_type" varchar(48) NOT NULL,
	"impacted_object_id" uuid NOT NULL,
	"impact_kind" "impact_kind" NOT NULL,
	"path_edge_ids" uuid[] NOT NULL,
	"path_depth" integer NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"rationale" text NOT NULL,
	"rewrite_required" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_impact_confidence_range" CHECK ("change_impact"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "change_impact_max_depth" CHECK ("change_impact"."path_depth" BETWEEN 0 AND 8),
	CONSTRAINT "change_impact_rewrite_enum" CHECK ("change_impact"."rewrite_required" IN ('yes', 'no', 'candidate'))
);
--> statement-breakpoint
CREATE TABLE "divergence_case_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"version_label" varchar(128) NOT NULL,
	"scenario" text NOT NULL,
	"old_answer" text NOT NULL,
	"new_answer" text NOT NULL,
	"rationale" text NOT NULL,
	"old_citation" jsonb NOT NULL,
	"new_citation" jsonb NOT NULL,
	"status" "case_status" DEFAULT 'draft' NOT NULL,
	"ambiguity_note" text,
	"approved_by_membership_id" uuid,
	"approved_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divergence_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "probe_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"case_version_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"assigned_by_membership_id" uuid,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "probe_delivery_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"status" "delivery_status" NOT NULL,
	"evidence" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "probe_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"answered_with" "probe_answer" NOT NULL,
	"response_text" text NOT NULL,
	"grading_confidence" numeric(4, 3) NOT NULL,
	"grading_rationale" text NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "probe_response_grading_confidence_range" CHECK ("probe_response"."grading_confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "recheck_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"case_version_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"status" "recheck_status" DEFAULT 'scheduled' NOT NULL,
	"result" "probe_answer",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remediation_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"probe_response_id" uuid NOT NULL,
	"artifact_version_id" uuid NOT NULL,
	"status" "remediation_status" DEFAULT 'assigned' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "remediation_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"remediation_assignment_id" uuid NOT NULL,
	"submitted_patch" text NOT NULL,
	"feedback" text NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_bundle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_event_version_id" uuid NOT NULL,
	"generated_by_membership_id" uuid NOT NULL,
	"storage_object_key" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"manifest" jsonb NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "actor_role_code" varchar(64);--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_locked_by_membership_id_membership_id_fk" FOREIGN KEY ("locked_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_source_version_id_source_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_domain_policy" ADD CONSTRAINT "organization_domain_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_role_code_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_version" ADD CONSTRAINT "source_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_version" ADD CONSTRAINT "source_version_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_version" ADD CONSTRAINT "source_version_locked_by_membership_id_membership_id_fk" FOREIGN KEY ("locked_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_reviewed_by_membership_id_membership_id_fk" FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_version" ADD CONSTRAINT "claim_version_locked_by_membership_id_membership_id_fk" FOREIGN KEY ("locked_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_edge_id_dependency_edge_id_fk" FOREIGN KEY ("edge_id") REFERENCES "public"."dependency_edge"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_reviewed_by_membership_id_membership_id_fk" FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge_version" ADD CONSTRAINT "dependency_edge_version_locked_by_membership_id_membership_id_fk" FOREIGN KEY ("locked_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependency_edge" ADD CONSTRAINT "dependency_edge_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_role_code_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_source_support" ADD CONSTRAINT "claim_source_support_claim_version_id_claim_version_id_fk" FOREIGN KEY ("claim_version_id") REFERENCES "public"."claim_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_source_support" ADD CONSTRAINT "claim_source_support_source_version_id_source_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_source_support" ADD CONSTRAINT "claim_source_support_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_change_event_id_change_event_id_fk" FOREIGN KEY ("change_event_id") REFERENCES "public"."change_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_old_source_version_id_source_version_id_fk" FOREIGN KEY ("old_source_version_id") REFERENCES "public"."source_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_new_source_version_id_source_version_id_fk" FOREIGN KEY ("new_source_version_id") REFERENCES "public"."source_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event_version" ADD CONSTRAINT "change_event_version_locked_by_membership_id_membership_id_fk" FOREIGN KEY ("locked_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event" ADD CONSTRAINT "change_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event" ADD CONSTRAINT "change_event_entered_by_membership_id_membership_id_fk" FOREIGN KEY ("entered_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_event" ADD CONSTRAINT "change_event_validated_by_membership_id_membership_id_fk" FOREIGN KEY ("validated_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_impact" ADD CONSTRAINT "change_impact_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_case_id_divergence_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."divergence_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_approved_by_membership_id_membership_id_fk" FOREIGN KEY ("approved_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case_version" ADD CONSTRAINT "divergence_case_version_locked_by_membership_id_membership_id_fk" FOREIGN KEY ("locked_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case" ADD CONSTRAINT "divergence_case_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divergence_case" ADD CONSTRAINT "divergence_case_change_event_id_change_event_id_fk" FOREIGN KEY ("change_event_id") REFERENCES "public"."change_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_assignment" ADD CONSTRAINT "probe_assignment_assigned_by_membership_id_membership_id_fk" FOREIGN KEY ("assigned_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_delivery_event" ADD CONSTRAINT "probe_delivery_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_delivery_event" ADD CONSTRAINT "probe_delivery_event_assignment_id_probe_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."probe_assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_response" ADD CONSTRAINT "probe_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probe_response" ADD CONSTRAINT "probe_response_assignment_id_probe_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."probe_assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recheck_assignment" ADD CONSTRAINT "recheck_assignment_case_version_id_divergence_case_version_id_fk" FOREIGN KEY ("case_version_id") REFERENCES "public"."divergence_case_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_assignment" ADD CONSTRAINT "remediation_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_assignment" ADD CONSTRAINT "remediation_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_assignment" ADD CONSTRAINT "remediation_assignment_probe_response_id_probe_response_id_fk" FOREIGN KEY ("probe_response_id") REFERENCES "public"."probe_response"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_assignment" ADD CONSTRAINT "remediation_assignment_artifact_version_id_artifact_version_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_attempt" ADD CONSTRAINT "remediation_attempt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remediation_attempt" ADD CONSTRAINT "remediation_attempt_remediation_assignment_id_remediation_assignment_id_fk" FOREIGN KEY ("remediation_assignment_id") REFERENCES "public"."remediation_assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle" ADD CONSTRAINT "report_bundle_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle" ADD CONSTRAINT "report_bundle_change_event_version_id_change_event_version_id_fk" FOREIGN KEY ("change_event_version_id") REFERENCES "public"."change_event_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_bundle" ADD CONSTRAINT "report_bundle_generated_by_membership_id_membership_id_fk" FOREIGN KEY ("generated_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_version_label_uq" ON "artifact_version" USING btree ("artifact_id","version_label");--> statement-breakpoint
CREATE INDEX "artifact_version_org_idx" ON "artifact_version" USING btree ("organization_id","artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_org_key_uq" ON "artifact" USING btree ("organization_id","canonical_key");--> statement-breakpoint
CREATE INDEX "artifact_owner_idx" ON "artifact" USING btree ("organization_id","owner_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunk_artifact_ordinal_uq" ON "document_chunk" USING btree ("artifact_version_id","chunk_ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunk_source_ordinal_uq" ON "document_chunk" USING btree ("source_version_id","chunk_ordinal");--> statement-breakpoint
CREATE INDEX "document_chunk_org_artifact_idx" ON "document_chunk" USING btree ("organization_id","artifact_version_id");--> statement-breakpoint
CREATE INDEX "document_chunk_org_source_idx" ON "document_chunk" USING btree ("organization_id","source_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_org_external_key_uq" ON "person" USING btree ("organization_id","external_key");--> statement-breakpoint
CREATE INDEX "person_org_role_idx" ON "person" USING btree ("organization_id","role_code");--> statement-breakpoint
CREATE UNIQUE INDEX "source_version_label_uq" ON "source_version" USING btree ("source_id","version_label");--> statement-breakpoint
CREATE INDEX "source_version_org_status_idx" ON "source_version" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "source_org_key_uq" ON "source" USING btree ("organization_id","canonical_key");--> statement-breakpoint
CREATE INDEX "source_org_kind_idx" ON "source" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_version_label_uq" ON "claim_version" USING btree ("claim_id","version_label");--> statement-breakpoint
CREATE INDEX "claim_version_org_review_idx" ON "claim_version" USING btree ("organization_id","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_artifact_key_uq" ON "claim" USING btree ("artifact_version_id","canonical_key");--> statement-breakpoint
CREATE INDEX "claim_org_artifact_idx" ON "claim" USING btree ("organization_id","artifact_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_edge_version_label_uq" ON "dependency_edge_version" USING btree ("edge_id","version_label");--> statement-breakpoint
CREATE INDEX "dependency_edge_version_org_review_idx" ON "dependency_edge_version" USING btree ("organization_id","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_edge_unique_uq" ON "dependency_edge" USING btree ("organization_id","kind","from_object_type","from_object_id","to_object_type","to_object_id");--> statement-breakpoint
CREATE INDEX "dependency_edge_from_idx" ON "dependency_edge" USING btree ("organization_id","from_object_type","from_object_id");--> statement-breakpoint
CREATE INDEX "dependency_edge_to_idx" ON "dependency_edge" USING btree ("organization_id","to_object_type","to_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_artifact_exposure_uq" ON "role_artifact_exposure" USING btree ("organization_id","role_code","artifact_version_id");--> statement-breakpoint
CREATE INDEX "role_artifact_exposure_role_idx" ON "role_artifact_exposure" USING btree ("organization_id","role_code");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_source_support_uq" ON "claim_source_support" USING btree ("claim_version_id","source_version_id");--> statement-breakpoint
CREATE INDEX "claim_source_support_source_idx" ON "claim_source_support" USING btree ("organization_id","source_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "change_event_version_label_uq" ON "change_event_version" USING btree ("change_event_id","version_label");--> statement-breakpoint
CREATE INDEX "change_event_version_org_idx" ON "change_event_version" USING btree ("organization_id","change_event_id");--> statement-breakpoint
CREATE INDEX "change_event_org_source_idx" ON "change_event" USING btree ("organization_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "change_impact_object_uq" ON "change_impact" USING btree ("change_event_version_id","impacted_object_type","impacted_object_id");--> statement-breakpoint
CREATE INDEX "change_impact_org_event_idx" ON "change_impact" USING btree ("organization_id","change_event_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "divergence_case_version_label_uq" ON "divergence_case_version" USING btree ("case_id","version_label");--> statement-breakpoint
CREATE INDEX "divergence_case_version_org_status_idx" ON "divergence_case_version" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "divergence_case_org_event_idx" ON "divergence_case" USING btree ("organization_id","change_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "probe_assignment_unique_uq" ON "probe_assignment" USING btree ("person_id","case_version_id");--> statement-breakpoint
CREATE INDEX "probe_assignment_org_event_idx" ON "probe_assignment" USING btree ("organization_id","change_event_version_id");--> statement-breakpoint
CREATE INDEX "probe_delivery_event_assignment_idx" ON "probe_delivery_event" USING btree ("organization_id","assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "probe_response_assignment_uq" ON "probe_response" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "probe_response_org_answer_idx" ON "probe_response" USING btree ("organization_id","answered_with");--> statement-breakpoint
CREATE INDEX "recheck_assignment_due_idx" ON "recheck_assignment" USING btree ("organization_id","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "recheck_assignment_unique_uq" ON "recheck_assignment" USING btree ("person_id","change_event_version_id","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "remediation_assignment_response_uq" ON "remediation_assignment" USING btree ("probe_response_id");--> statement-breakpoint
CREATE INDEX "remediation_assignment_org_person_idx" ON "remediation_assignment" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE INDEX "remediation_attempt_assignment_idx" ON "remediation_attempt" USING btree ("organization_id","remediation_assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_bundle_event_sha_uq" ON "report_bundle" USING btree ("change_event_version_id","sha256");--> statement-breakpoint
CREATE INDEX "report_bundle_org_event_idx" ON "report_bundle" USING btree ("organization_id","change_event_version_id");--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_role_code_role_code_fk" FOREIGN KEY ("actor_role_code") REFERENCES "public"."role"("code") ON DELETE no action ON UPDATE no action;