CREATE TABLE "workflow_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"step_key" varchar(128) NOT NULL,
	"label" varchar(255) NOT NULL,
	"status" "workflow_status" DEFAULT 'queued' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_chunk" drop column "search_vector";--> statement-breakpoint
ALTER TABLE "document_chunk" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_step_run_key_uq" ON "workflow_step" USING btree ("workflow_run_id","step_key");--> statement-breakpoint
CREATE INDEX "workflow_step_org_run_idx" ON "workflow_step" USING btree ("organization_id","workflow_run_id");--> statement-breakpoint
CREATE INDEX "document_chunk_embedding_hnsw_idx" ON "document_chunk" USING hnsw ("embedding" vector_cosine_ops) WHERE "document_chunk"."embedding" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "document_chunk_search_vector_gin_idx" ON "document_chunk" USING gin ("search_vector");--> statement-breakpoint
ALTER TABLE "workflow_step" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflow_step_tenant_isolation" ON "workflow_step"
  USING ("organization_id" = app.current_organization_id())
  WITH CHECK ("organization_id" = app.current_organization_id());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "workflow_step" TO supersede_app;
