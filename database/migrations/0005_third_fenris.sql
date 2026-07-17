ALTER TABLE "divergence_case_version" ADD COLUMN IF NOT EXISTS "authored_by_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE divergence_case_version DISABLE TRIGGER divergence_case_version_immutable_when_locked;
--> statement-breakpoint
UPDATE divergence_case_version
SET authored_by_membership_id = change_event.entered_by_membership_id
FROM divergence_case
JOIN change_event ON change_event.id = divergence_case.change_event_id
WHERE divergence_case.id = divergence_case_version.case_id
  AND divergence_case.organization_id = divergence_case_version.organization_id
  AND change_event.organization_id = divergence_case_version.organization_id
  AND divergence_case_version.authored_by_membership_id IS NULL;
--> statement-breakpoint
ALTER TABLE divergence_case_version ENABLE TRIGGER divergence_case_version_immutable_when_locked;
--> statement-breakpoint
ALTER TABLE "divergence_case_version" ALTER COLUMN "authored_by_membership_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'divergence_case_version_authored_by_membership_id_membership_id'
      AND conrelid = 'divergence_case_version'::regclass
  ) THEN
    ALTER TABLE "divergence_case_version"
      ADD CONSTRAINT "divergence_case_version_authored_by_membership_id_membership_id_fk"
      FOREIGN KEY ("authored_by_membership_id") REFERENCES "public"."membership"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$$;
--> statement-breakpoint

INSERT INTO audit_event (
  organization_id,
  actor_membership_id,
  actor_role_code,
  event_type,
  object_type,
  object_id,
  object_version_id,
  payload,
  occurred_at
)
SELECT
  organization_id,
  actor_membership_id,
  actor_role_code,
  CASE action
    WHEN 'submitted' THEN 'change.submitted'
    ELSE 'report.generated'
  END,
  object_type,
  object_id,
  object_version_id,
  metadata || jsonb_build_object('migratedFromApprovalRecordId', id),
  created_at
FROM approval_record
WHERE action IN ('submitted', 'exported');
--> statement-breakpoint

ALTER TABLE approval_record DISABLE TRIGGER approval_record_append_only;
--> statement-breakpoint
UPDATE approval_record
SET action = CASE
  WHEN action = 'validated' THEN 'change_validated'
  WHEN action = 'reviewed' THEN 'edge_accepted'
  WHEN action = 'approved' THEN 'case_approved'
  ELSE action
END
WHERE action IN ('validated', 'reviewed', 'approved');
--> statement-breakpoint
DELETE FROM approval_record
WHERE action IN ('submitted', 'exported');
--> statement-breakpoint
ALTER TABLE approval_record ENABLE TRIGGER approval_record_append_only;
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
      PERFORM app.require_parent_org('membership', NEW.authored_by_membership_id, NEW.organization_id, 'divergence_case_version.authored_by_membership_id');
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

CREATE OR REPLACE FUNCTION app.validate_approval_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  required_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM membership
    WHERE id = NEW.actor_membership_id
      AND organization_id = NEW.organization_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'approval actor is not an active member of this organization'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM membership_role
    WHERE organization_id = NEW.organization_id
      AND membership_id = NEW.actor_membership_id
      AND role_code = NEW.actor_role_code
  ) THEN
    RAISE EXCEPTION 'approval actor does not hold role %', NEW.actor_role_code
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.action = 'change_validated' AND NEW.object_type <> 'change_event')
    OR (NEW.action IN ('edge_accepted', 'edge_overridden') AND NEW.object_type <> 'dependency_edge')
    OR (NEW.action = 'artifact_version_approved' AND NEW.object_type <> 'artifact_version')
    OR (NEW.action IN ('case_approved', 'case_retired', 'release_authorized') AND NEW.object_type <> 'divergence_case')
    OR (NEW.action = 'export_released' AND NEW.object_type <> 'report_bundle')
    OR (NEW.action = 'retention_changed' AND NEW.object_type NOT IN ('organization', 'report_bundle')) THEN
    RAISE EXCEPTION 'approval action % is not valid for object type %', NEW.action, NEW.object_type
      USING ERRCODE = '23514';
  END IF;

  required_role := CASE NEW.action
    WHEN 'change_validated' THEN 'change_validator'
    WHEN 'edge_accepted' THEN 'edge_reviewer'
    WHEN 'edge_overridden' THEN 'edge_reviewer'
    WHEN 'artifact_version_approved' THEN 'edge_reviewer'
    WHEN 'case_approved' THEN 'case_approver'
    WHEN 'case_retired' THEN 'case_approver'
    WHEN 'release_authorized' THEN 'release_authorizer'
    WHEN 'export_released' THEN 'auditor'
    WHEN 'retention_changed' THEN 'auditor'
    ELSE NULL
  END;

  IF required_role IS NULL THEN
    RAISE EXCEPTION 'approval action % is not governed', NEW.action
      USING ERRCODE = '23514';
  END IF;

  IF NEW.actor_role_code <> required_role THEN
    RAISE EXCEPTION 'approval action % requires role %', NEW.action, required_role
      USING ERRCODE = '42501';
  END IF;

  IF NEW.action = 'change_validated'
    AND EXISTS (
      SELECT 1
      FROM change_event
      WHERE id = NEW.object_id
        AND organization_id = NEW.organization_id
        AND entered_by_membership_id = NEW.actor_membership_id
    ) THEN
    RAISE EXCEPTION 'change owner cannot validate the same change event'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.action = 'case_approved'
    AND EXISTS (
      SELECT 1
      FROM divergence_case_version
      WHERE id = NEW.object_version_id
        AND organization_id = NEW.organization_id
        AND authored_by_membership_id = NEW.actor_membership_id
    ) THEN
    RAISE EXCEPTION 'case author cannot approve the same case version'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.action = 'release_authorized'
    AND EXISTS (
      SELECT 1
      FROM approval_record previous
      WHERE previous.organization_id = NEW.organization_id
        AND previous.object_type = NEW.object_type
        AND previous.object_id = NEW.object_id
        AND previous.action = 'case_approved'
        AND previous.actor_membership_id = NEW.actor_membership_id
    ) THEN
    RAISE EXCEPTION 'case approver cannot authorize release for the same case'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
