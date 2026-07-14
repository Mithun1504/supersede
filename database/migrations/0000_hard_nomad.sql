CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('queued', 'running', 'partial', 'failed', 'completed', 'quota_paused');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended', 'deprovisioned');--> statement-breakpoint
CREATE TYPE "public"."product_configuration" AS ENUM('propagate', 'displace');--> statement-breakpoint
CREATE TABLE "approval_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_role_code" varchar(64) NOT NULL,
	"object_type" varchar(64) NOT NULL,
	"object_id" uuid NOT NULL,
	"object_version_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_membership_id" uuid,
	"event_type" varchar(128) NOT NULL,
	"object_type" varchar(64) NOT NULL,
	"object_id" uuid NOT NULL,
	"object_version_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_name" varchar(128) NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_run_id" varchar(255),
	"workflow_name" varchar(128) NOT NULL,
	"subject_type" varchar(64) NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "workflow_status" DEFAULT 'queued' NOT NULL,
	"progress_current" integer DEFAULT 0 NOT NULL,
	"progress_total" integer,
	"error_code" varchar(64),
	"error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_role" (
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_code" varchar(64) NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_role_membership_id_role_code_pk" PRIMARY KEY("membership_id","role_code")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workos_user_id" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_organization_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"product_configuration" "product_configuration" NOT NULL,
	"individual_results_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"code" varchar(64) PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_actor_membership_id_membership_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_actor_role_code_role_code_fk" FOREIGN KEY ("actor_role_code") REFERENCES "public"."role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_membership_id_membership_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role" ADD CONSTRAINT "membership_role_role_code_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_record_object_idx" ON "approval_record" USING btree ("organization_id","object_type","object_id");--> statement-breakpoint
CREATE INDEX "approval_record_actor_idx" ON "approval_record" USING btree ("organization_id","actor_membership_id");--> statement-breakpoint
CREATE INDEX "audit_event_timeline_idx" ON "audit_event" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_event_idempotency_uq" ON "outbox_event" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_event_dispatch_idx" ON "outbox_event" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "workflow_run_subject_idx" ON "workflow_run" USING btree ("organization_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "membership_role_organization_idx" ON "membership_role" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_workos_user_uq" ON "membership" USING btree ("organization_id","workos_user_id");--> statement-breakpoint
CREATE INDEX "membership_organization_idx" ON "membership" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_workos_id_uq" ON "organization" USING btree ("workos_organization_id");