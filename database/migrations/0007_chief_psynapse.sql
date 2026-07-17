CREATE TABLE "api_rate_limit_bucket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"scope" varchar(64) NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "probe_response" ADD COLUMN "grading_evidence_quote" text;--> statement-breakpoint
ALTER TABLE "probe_response" ADD COLUMN "review_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "api_rate_limit_bucket" ADD CONSTRAINT "api_rate_limit_bucket_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_rate_limit_bucket" ADD CONSTRAINT "api_rate_limit_bucket_actor_membership_id_membership_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_rate_limit_bucket_actor_scope_uq" ON "api_rate_limit_bucket" USING btree ("organization_id","actor_membership_id","scope");--> statement-breakpoint
ALTER TABLE "api_rate_limit_bucket" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_rate_limit_bucket_tenant_isolation"
  ON "api_rate_limit_bucket"
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "api_rate_limit_bucket" TO supersede_app;
