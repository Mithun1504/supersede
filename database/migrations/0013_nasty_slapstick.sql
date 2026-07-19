DROP INDEX "workflow_run_external_id_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_external_id_uq" ON "workflow_run" USING btree ("organization_id","external_run_id");