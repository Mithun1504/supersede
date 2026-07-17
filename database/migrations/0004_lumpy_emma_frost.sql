ALTER TYPE "public"."recheck_status" ADD VALUE 'blocked_case_required';
--> statement-breakpoint
CREATE TABLE "professional_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "professional_role" ADD CONSTRAINT "professional_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "professional_role_org_code_uq" ON "professional_role" USING btree ("organization_id","code");
--> statement-breakpoint
CREATE INDEX "professional_role_org_idx" ON "professional_role" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "professional_role" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY professional_role_tenant_isolation ON professional_role
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
--> statement-breakpoint
CREATE TRIGGER professional_role_displace_only
BEFORE INSERT OR UPDATE ON professional_role
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
--> statement-breakpoint
INSERT INTO professional_role (organization_id, code, display_name, description)
SELECT DISTINCT organization_id, 'imported_clinician', 'Imported Clinician', 'Fallback role for rows created before professional roles existed.'
FROM (
  SELECT organization_id FROM person
  UNION
  SELECT organization_id FROM role_artifact_exposure
) existing
ON CONFLICT (organization_id, code) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "person" DROP CONSTRAINT "person_role_code_role_code_fk";
--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" DROP CONSTRAINT "role_artifact_exposure_role_code_role_code_fk";
--> statement-breakpoint
DROP INDEX "person_org_role_idx";
--> statement-breakpoint
DROP INDEX "role_artifact_exposure_uq";
--> statement-breakpoint
DROP INDEX "role_artifact_exposure_role_idx";
--> statement-breakpoint
ALTER TABLE "recheck_assignment" ALTER COLUMN "case_version_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "professional_role_id" uuid;
--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD COLUMN "professional_role_id" uuid;
--> statement-breakpoint
UPDATE person
SET professional_role_id = professional_role.id
FROM professional_role
WHERE professional_role.organization_id = person.organization_id
  AND professional_role.code = 'imported_clinician'
  AND person.professional_role_id IS NULL;
--> statement-breakpoint
UPDATE role_artifact_exposure
SET professional_role_id = professional_role.id
FROM professional_role
WHERE professional_role.organization_id = role_artifact_exposure.organization_id
  AND professional_role.code = 'imported_clinician'
  AND role_artifact_exposure.professional_role_id IS NULL;
--> statement-breakpoint
ALTER TABLE "person" ALTER COLUMN "professional_role_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ALTER COLUMN "professional_role_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_professional_role_id_professional_role_id_fk" FOREIGN KEY ("professional_role_id") REFERENCES "public"."professional_role"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" ADD CONSTRAINT "role_artifact_exposure_professional_role_id_professional_role_id_fk" FOREIGN KEY ("professional_role_id") REFERENCES "public"."professional_role"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "change_event" ADD CONSTRAINT "change_event_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "person_org_professional_role_idx" ON "person" USING btree ("organization_id","professional_role_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "role_artifact_exposure_uq" ON "role_artifact_exposure" USING btree ("organization_id","professional_role_id","artifact_version_id");
--> statement-breakpoint
CREATE INDEX "role_artifact_exposure_role_idx" ON "role_artifact_exposure" USING btree ("organization_id","professional_role_id");
--> statement-breakpoint
ALTER TABLE "person" DROP COLUMN "role_code";
--> statement-breakpoint
ALTER TABLE "role_artifact_exposure" DROP COLUMN "role_code";
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.require_parent_org(
  parent_table regclass,
  parent_id uuid,
  expected_organization_id uuid,
  label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  matches boolean;
BEGIN
  IF parent_id IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1 AND organization_id = $2)',
    parent_table
  )
  INTO matches
  USING parent_id, expected_organization_id;

  IF NOT matches THEN
    RAISE EXCEPTION '% organization mismatch', label
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_domain_parent_organizations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'membership_role' THEN
      PERFORM app.require_parent_org('membership', NEW.membership_id, NEW.organization_id, 'membership_role.membership_id');
    WHEN 'professional_role' THEN
      NULL;
    WHEN 'person' THEN
      PERFORM app.require_parent_org('membership', NEW.membership_id, NEW.organization_id, 'person.membership_id');
      PERFORM app.require_parent_org('professional_role', NEW.professional_role_id, NEW.organization_id, 'person.professional_role_id');
    WHEN 'source_version' THEN
      PERFORM app.require_parent_org('source', NEW.source_id, NEW.organization_id, 'source_version.source_id');
      PERFORM app.require_parent_org('membership', NEW.locked_by_membership_id, NEW.organization_id, 'source_version.locked_by_membership_id');
    WHEN 'artifact' THEN
      PERFORM app.require_parent_org('membership', NEW.owner_membership_id, NEW.organization_id, 'artifact.owner_membership_id');
    WHEN 'artifact_version' THEN
      PERFORM app.require_parent_org('artifact', NEW.artifact_id, NEW.organization_id, 'artifact_version.artifact_id');
      PERFORM app.require_parent_org('membership', NEW.locked_by_membership_id, NEW.organization_id, 'artifact_version.locked_by_membership_id');
    WHEN 'document_chunk' THEN
      PERFORM app.require_parent_org('artifact_version', NEW.artifact_version_id, NEW.organization_id, 'document_chunk.artifact_version_id');
      PERFORM app.require_parent_org('source_version', NEW.source_version_id, NEW.organization_id, 'document_chunk.source_version_id');
    WHEN 'claim' THEN
      PERFORM app.require_parent_org('artifact_version', NEW.artifact_version_id, NEW.organization_id, 'claim.artifact_version_id');
    WHEN 'claim_version' THEN
      PERFORM app.require_parent_org('claim', NEW.claim_id, NEW.organization_id, 'claim_version.claim_id');
      PERFORM app.require_parent_org('membership', NEW.reviewed_by_membership_id, NEW.organization_id, 'claim_version.reviewed_by_membership_id');
      PERFORM app.require_parent_org('membership', NEW.locked_by_membership_id, NEW.organization_id, 'claim_version.locked_by_membership_id');
    WHEN 'dependency_edge_version' THEN
      PERFORM app.require_parent_org('dependency_edge', NEW.edge_id, NEW.organization_id, 'dependency_edge_version.edge_id');
      PERFORM app.require_parent_org('membership', NEW.reviewed_by_membership_id, NEW.organization_id, 'dependency_edge_version.reviewed_by_membership_id');
      PERFORM app.require_parent_org('membership', NEW.locked_by_membership_id, NEW.organization_id, 'dependency_edge_version.locked_by_membership_id');
    WHEN 'role_artifact_exposure' THEN
      PERFORM app.require_parent_org('professional_role', NEW.professional_role_id, NEW.organization_id, 'role_artifact_exposure.professional_role_id');
      PERFORM app.require_parent_org('artifact_version', NEW.artifact_version_id, NEW.organization_id, 'role_artifact_exposure.artifact_version_id');
    WHEN 'claim_source_support' THEN
      PERFORM app.require_parent_org('claim_version', NEW.claim_version_id, NEW.organization_id, 'claim_source_support.claim_version_id');
      PERFORM app.require_parent_org('source_version', NEW.source_version_id, NEW.organization_id, 'claim_source_support.source_version_id');
    WHEN 'change_event' THEN
      PERFORM app.require_parent_org('source', NEW.source_id, NEW.organization_id, 'change_event.source_id');
      PERFORM app.require_parent_org('membership', NEW.entered_by_membership_id, NEW.organization_id, 'change_event.entered_by_membership_id');
      PERFORM app.require_parent_org('membership', NEW.validated_by_membership_id, NEW.organization_id, 'change_event.validated_by_membership_id');
    WHEN 'change_event_version' THEN
      PERFORM app.require_parent_org('change_event', NEW.change_event_id, NEW.organization_id, 'change_event_version.change_event_id');
      PERFORM app.require_parent_org('source_version', NEW.old_source_version_id, NEW.organization_id, 'change_event_version.old_source_version_id');
      PERFORM app.require_parent_org('source_version', NEW.new_source_version_id, NEW.organization_id, 'change_event_version.new_source_version_id');
      PERFORM app.require_parent_org('membership', NEW.locked_by_membership_id, NEW.organization_id, 'change_event_version.locked_by_membership_id');
    WHEN 'change_impact' THEN
      PERFORM app.require_parent_org('change_event_version', NEW.change_event_version_id, NEW.organization_id, 'change_impact.change_event_version_id');
    WHEN 'divergence_case' THEN
      PERFORM app.require_parent_org('change_event', NEW.change_event_id, NEW.organization_id, 'divergence_case.change_event_id');
    WHEN 'divergence_case_version' THEN
      PERFORM app.require_parent_org('divergence_case', NEW.case_id, NEW.organization_id, 'divergence_case_version.case_id');
      PERFORM app.require_parent_org('change_event_version', NEW.change_event_version_id, NEW.organization_id, 'divergence_case_version.change_event_version_id');
      PERFORM app.require_parent_org('membership', NEW.approved_by_membership_id, NEW.organization_id, 'divergence_case_version.approved_by_membership_id');
      PERFORM app.require_parent_org('membership', NEW.locked_by_membership_id, NEW.organization_id, 'divergence_case_version.locked_by_membership_id');
    WHEN 'probe_assignment' THEN
      PERFORM app.require_parent_org('person', NEW.person_id, NEW.organization_id, 'probe_assignment.person_id');
      PERFORM app.require_parent_org('divergence_case_version', NEW.case_version_id, NEW.organization_id, 'probe_assignment.case_version_id');
      PERFORM app.require_parent_org('change_event_version', NEW.change_event_version_id, NEW.organization_id, 'probe_assignment.change_event_version_id');
      PERFORM app.require_parent_org('membership', NEW.assigned_by_membership_id, NEW.organization_id, 'probe_assignment.assigned_by_membership_id');
    WHEN 'probe_delivery_event' THEN
      PERFORM app.require_parent_org('probe_assignment', NEW.assignment_id, NEW.organization_id, 'probe_delivery_event.assignment_id');
    WHEN 'probe_response' THEN
      PERFORM app.require_parent_org('probe_assignment', NEW.assignment_id, NEW.organization_id, 'probe_response.assignment_id');
    WHEN 'remediation_assignment' THEN
      PERFORM app.require_parent_org('person', NEW.person_id, NEW.organization_id, 'remediation_assignment.person_id');
      PERFORM app.require_parent_org('probe_response', NEW.probe_response_id, NEW.organization_id, 'remediation_assignment.probe_response_id');
      PERFORM app.require_parent_org('artifact_version', NEW.artifact_version_id, NEW.organization_id, 'remediation_assignment.artifact_version_id');
    WHEN 'remediation_attempt' THEN
      PERFORM app.require_parent_org('remediation_assignment', NEW.remediation_assignment_id, NEW.organization_id, 'remediation_attempt.remediation_assignment_id');
    WHEN 'recheck_assignment' THEN
      PERFORM app.require_parent_org('person', NEW.person_id, NEW.organization_id, 'recheck_assignment.person_id');
      PERFORM app.require_parent_org('change_event_version', NEW.change_event_version_id, NEW.organization_id, 'recheck_assignment.change_event_version_id');
      PERFORM app.require_parent_org('divergence_case_version', NEW.case_version_id, NEW.organization_id, 'recheck_assignment.case_version_id');
    WHEN 'report_bundle' THEN
      PERFORM app.require_parent_org('change_event_version', NEW.change_event_version_id, NEW.organization_id, 'report_bundle.change_event_version_id');
      PERFORM app.require_parent_org('membership', NEW.generated_by_membership_id, NEW.organization_id, 'report_bundle.generated_by_membership_id');
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'professional_role',
    'person',
    'source_version',
    'artifact',
    'artifact_version',
    'document_chunk',
    'claim',
    'claim_version',
    'dependency_edge_version',
    'role_artifact_exposure',
    'claim_source_support',
    'change_event',
    'change_event_version',
    'change_impact',
    'divergence_case',
    'divergence_case_version',
    'probe_assignment',
    'probe_delivery_event',
    'probe_response',
    'remediation_assignment',
    'remediation_attempt',
    'recheck_assignment',
    'report_bundle'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.validate_domain_parent_organizations()',
      table_name || '_organization_guard',
      table_name
    );
  END LOOP;
END;
$$;
