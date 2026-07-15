-- Cross-domain invariants which cannot be represented by Drizzle's table DSL.
-- Keep these functions fail-closed: an unknown object state or tenant mismatch aborts the write.

-- PostgreSQL enum additions must commit before the new value can be used as a default.
ALTER TABLE membership ALTER COLUMN status SET DEFAULT 'invited';
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS approval_record_append_only ON approval_record;
DROP TRIGGER IF EXISTS audit_event_append_only ON audit_event;
--> statement-breakpoint

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'approval_record', 'audit_event', 'review_action', 'case_retirement',
    'probe_delivery_event', 'probe_response', 'usage_event'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_append_only', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.reject_mutation()',
      table_name || '_append_only', table_name
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.enforce_tenant_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  local_value text;
  parent_organization_id uuid;
BEGIN
  local_value := to_jsonb(NEW) ->> TG_ARGV[0];
  IF local_value IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT organization_id FROM %I WHERE %I = $1', TG_ARGV[1], TG_ARGV[2])
    INTO parent_organization_id
    USING local_value::uuid;

  IF parent_organization_id IS NULL OR parent_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'tenant mismatch: %.% references %.%', TG_TABLE_NAME, TG_ARGV[0], TG_ARGV[1], TG_ARGV[2]
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Install a tenant-equality trigger for every ordinary single-column FK between tenant tables.
-- This complements RLS because PostgreSQL FK checks do not automatically compare organization_id.
DO $$
DECLARE
  relationship record;
BEGIN
  FOR relationship IN
    SELECT
      child.relname AS child_table,
      child_column.attname AS child_column,
      parent.relname AS parent_table,
      parent_column.attname AS parent_column,
      constraint_row.conname AS constraint_name
    FROM pg_constraint constraint_row
    JOIN pg_class child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = constraint_row.confrelid
    JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
    JOIN pg_attribute child_column
      ON child_column.attrelid = child.oid AND child_column.attnum = constraint_row.conkey[1]
    JOIN pg_attribute parent_column
      ON parent_column.attrelid = parent.oid AND parent_column.attnum = constraint_row.confkey[1]
    WHERE constraint_row.contype = 'f'
      AND array_length(constraint_row.conkey, 1) = 1
      AND child_namespace.nspname = 'public'
      AND parent_namespace.nspname = 'public'
      AND child_column.attname <> 'organization_id'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = child.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      )
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = parent.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I',
      'tenant_guard_' || relationship.constraint_name,
      relationship.child_table
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, organization_id ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION app.enforce_tenant_reference(%L, %L, %L)',
      'tenant_guard_' || relationship.constraint_name,
      relationship.child_column,
      relationship.child_table,
      relationship.child_column,
      relationship.parent_table,
      relationship.parent_column
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.organization_is_displace(candidate_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization
    WHERE id = candidate_organization_id
      AND product_configuration = 'displace'
      AND status = 'active'
  )
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.organization_is_displace(uuid) FROM PUBLIC;
--> statement-breakpoint

-- RLS is forced even for table owners. Displace-only policies add the product boundary to tenancy.
DO $$
DECLARE
  table_name text;
  displace_tables text[] := ARRAY[
    'person', 'work_role', 'person_work_role', 'cohort', 'cohort_member',
    'role_artifact_exposure', 'divergence', 'divergence_case',
    'divergence_case_version', 'case_version_citation', 'case_retirement',
    'release_batch', 'release_case', 'release_exercise', 'release_target',
    'release_target_person', 'probe_assignment', 'probe_delivery_event',
    'probe_response', 'probe_assessment', 'exercise', 'exercise_version',
    'remediation_assignment', 'remediation_attempt', 'recheck_assignment'
  ];
  tenant_tables text[] := ARRAY[
    'organization', 'organization_settings', 'membership', 'membership_role',
    'service_account', 'service_account_permission', 'api_credential', 'support_access_grant',
    'person', 'work_role', 'person_work_role', 'cohort', 'cohort_member',
    'corpus', 'upload_session', 'storage_object', 'document_version', 'document_chunk',
    'source', 'source_version', 'artifact', 'artifact_version', 'artifact_owner',
    'corpus_source', 'corpus_artifact', 'evidence_span', 'extraction_run', 'ai_model_run',
    'ai_run_input', 'ai_run_retrieval_chunk', 'review_task', 'review_session', 'review_action',
    'claim', 'claim_version', 'graph_node', 'dependency_edge', 'dependency_edge_version',
    'role_artifact_exposure', 'change_event', 'change_event_version',
    'change_event_version_citation', 'propagation_run', 'change_impact',
    'change_impact_path', 'change_impact_path_step', 'artifact_remediation',
    'divergence', 'divergence_case', 'divergence_case_version', 'case_version_citation',
    'case_retirement', 'release_batch', 'release_case', 'release_exercise', 'release_target',
    'release_target_person', 'probe_assignment', 'probe_delivery_event', 'probe_response',
    'probe_assessment', 'exercise', 'exercise_version', 'remediation_assignment',
    'remediation_attempt', 'recheck_assignment', 'approval_policy', 'approval_policy_role',
    'approval_record', 'audit_event', 'report_bundle', 'report_bundle_item',
    'retention_policy', 'legal_hold', 'data_disposition_run', 'integration_connection',
    'integration_event', 'integration_job', 'integration_job_item', 'notification',
    'notification_preference', 'notification_delivery', 'workflow_run', 'workflow_step',
    'outbox_event', 'idempotency_record', 'usage_event'
  ];
  tenant_expression text;
BEGIN
  FOREACH table_name IN ARRAY tenant_tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_isolation', table_name);

    tenant_expression := CASE
      WHEN table_name = 'organization' THEN 'id = app.current_organization_id()'
      ELSE 'organization_id = app.current_organization_id()'
    END;

    IF table_name = ANY(displace_tables) THEN
      tenant_expression := tenant_expression || ' AND app.organization_is_displace(organization_id)';
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON %I USING (%s) WITH CHECK (%s)',
      table_name || '_tenant_isolation', table_name, tenant_expression, tenant_expression
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_change_event_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_source_id uuid;
  old_source_id uuid;
  new_source_id uuid;
BEGIN
  SELECT source_id INTO event_source_id FROM change_event WHERE id = NEW.change_event_id;
  SELECT source_id INTO old_source_id FROM source_version WHERE id = NEW.old_source_version_id;
  SELECT source_id INTO new_source_id FROM source_version WHERE id = NEW.new_source_version_id;
  IF event_source_id IS NULL OR old_source_id <> event_source_id OR new_source_id <> event_source_id THEN
    RAISE EXCEPTION 'ChangeEvent source versions must belong to the event source' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER change_event_version_source_guard
BEFORE INSERT OR UPDATE ON change_event_version
FOR EACH ROW EXECUTE FUNCTION app.validate_change_event_version();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_governed_citations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  side_name text;
  expected_source_version_id uuid;
  citation_count integer;
BEGIN
  IF TG_TABLE_NAME = 'change_event_version' AND NEW.status IN ('submitted', 'validated') THEN
    FOREACH side_name IN ARRAY ARRAY['old', 'new'] LOOP
      expected_source_version_id := CASE WHEN side_name = 'old' THEN NEW.old_source_version_id ELSE NEW.new_source_version_id END;
      SELECT count(*) INTO citation_count
      FROM change_event_version_citation citation
      JOIN evidence_span evidence ON evidence.id = citation.evidence_span_id
      WHERE citation.change_event_version_id = NEW.id
        AND citation.citation_side = side_name
        AND citation.source_version_id = expected_source_version_id
        AND evidence.verification_status IN ('exact', 'fuzzy_verified', 'human_verified');
      IF citation_count < 1 THEN
        RAISE EXCEPTION 'submitted ChangeEvent version requires a verified % citation', side_name USING ERRCODE = '23514';
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME = 'divergence_case_version' AND NEW.record_status = 'approved' THEN
    FOREACH side_name IN ARRAY ARRAY['old', 'new'] LOOP
      SELECT count(*) INTO citation_count
      FROM case_version_citation citation
      JOIN evidence_span evidence ON evidence.id = citation.evidence_span_id
      WHERE citation.case_version_id = NEW.id
        AND citation.citation_side = side_name
        AND evidence.verification_status IN ('exact', 'fuzzy_verified', 'human_verified');
      IF citation_count < 1 THEN
        RAISE EXCEPTION 'approved case version requires a verified % citation', side_name USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER change_event_version_citation_guard
AFTER INSERT OR UPDATE OF status ON change_event_version
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_governed_citations();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER case_version_citation_guard
AFTER INSERT OR UPDATE OF record_status ON divergence_case_version
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_governed_citations();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_release_content()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_change_event_version_id uuid;
  content_change_event_version_id uuid;
  content_status record_status;
BEGIN
  SELECT change_event_version_id INTO batch_change_event_version_id
  FROM release_batch WHERE id = NEW.release_batch_id;

  IF TG_TABLE_NAME = 'release_case' THEN
    SELECT divergence.change_event_version_id, case_version.record_status
      INTO content_change_event_version_id, content_status
    FROM divergence_case_version case_version
    JOIN divergence_case case_identity ON case_identity.id = case_version.divergence_case_id
    JOIN divergence ON divergence.id = case_identity.divergence_id
    LEFT JOIN case_retirement retirement ON retirement.case_version_id = case_version.id
    WHERE case_version.id = NEW.case_version_id AND retirement.id IS NULL;
  ELSE
    SELECT divergence.change_event_version_id, exercise_version.record_status
      INTO content_change_event_version_id, content_status
    FROM exercise_version
    JOIN exercise ON exercise.id = exercise_version.exercise_id AND exercise.retired_at IS NULL
    JOIN divergence ON divergence.id = exercise.divergence_id
    WHERE exercise_version.id = NEW.exercise_version_id;
  END IF;

  IF content_status IS DISTINCT FROM 'approved' OR content_change_event_version_id IS DISTINCT FROM batch_change_event_version_id THEN
    RAISE EXCEPTION 'release content must be approved, unretired, and belong to the release ChangeEvent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER release_case_content_guard BEFORE INSERT OR UPDATE ON release_case
FOR EACH ROW EXECUTE FUNCTION app.validate_release_content();
--> statement-breakpoint
CREATE TRIGGER release_exercise_content_guard BEFORE INSERT OR UPDATE ON release_exercise
FOR EACH ROW EXECUTE FUNCTION app.validate_release_content();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.lock_release_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_status release_status;
  batch_id uuid;
BEGIN
  batch_id := CASE WHEN TG_TABLE_NAME = 'release_batch' THEN OLD.id ELSE COALESCE(OLD.release_batch_id, NEW.release_batch_id) END;
  SELECT status INTO batch_status FROM release_batch WHERE id = batch_id;
  IF batch_status IN ('awaiting_authorization', 'authorized', 'releasing', 'released') THEN
    IF TG_TABLE_NAME = 'release_batch' AND TG_OP = 'UPDATE' THEN
      IF (to_jsonb(NEW) - ARRAY['status','authorized_at','released_at','updated_at'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','authorized_at','released_at','updated_at']) THEN
        RAISE EXCEPTION 'release decision inputs are locked' USING ERRCODE = '55000';
      END IF;
    ELSE
      RAISE EXCEPTION 'release children are locked while authorization is pending or complete' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER release_batch_lock BEFORE UPDATE ON release_batch
FOR EACH ROW EXECUTE FUNCTION app.lock_release_children();
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['release_case','release_exercise','release_target','release_target_person'] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.lock_release_children()',
      table_name || '_release_lock', table_name
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_recheck_case()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_case_id uuid;
  selected_case_id uuid;
  selected_divergence_id uuid;
  sibling_case_id uuid;
  selected_status record_status;
BEGIN
  IF NEW.selected_case_version_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT divergence_case_id INTO original_case_id FROM divergence_case_version WHERE id = NEW.original_case_version_id;
  SELECT case_version.divergence_case_id, case_identity.divergence_id, case_version.record_status
    INTO selected_case_id, selected_divergence_id, selected_status
  FROM divergence_case_version case_version
  JOIN divergence_case case_identity ON case_identity.id = case_version.divergence_case_id
  LEFT JOIN case_retirement retirement ON retirement.case_version_id = case_version.id
  WHERE case_version.id = NEW.selected_case_version_id AND retirement.id IS NULL;
  SELECT case_version.divergence_case_id INTO sibling_case_id
  FROM recheck_assignment sibling
  JOIN divergence_case_version case_version ON case_version.id = sibling.selected_case_version_id
  WHERE sibling.remediation_assignment_id = NEW.remediation_assignment_id
    AND sibling.id <> NEW.id
    AND sibling.selected_case_version_id IS NOT NULL
  LIMIT 1;

  IF selected_status IS DISTINCT FROM 'approved'
     OR selected_divergence_id IS DISTINCT FROM NEW.divergence_id
     OR selected_case_id IS NULL
     OR selected_case_id = original_case_id
     OR selected_case_id = sibling_case_id THEN
    RAISE EXCEPTION 'recheck requires a distinct approved, unretired case identity from the same divergence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER recheck_case_guard
AFTER INSERT OR UPDATE OF selected_case_version_id ON recheck_assignment
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.validate_recheck_case();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.protect_approved_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  status_value text;
  lifecycle_columns text[];
BEGIN
  status_value := CASE
    WHEN to_jsonb(OLD) ? 'record_status' THEN to_jsonb(OLD) ->> 'record_status'
    WHEN to_jsonb(OLD) ? 'status' THEN to_jsonb(OLD) ->> 'status'
    WHEN to_jsonb(OLD) ? 'review_status' THEN to_jsonb(OLD) ->> 'review_status'
    ELSE NULL
  END;
  lifecycle_columns := CASE
    WHEN coalesce(TG_ARGV[0], '') = '' THEN ARRAY[]::text[]
    ELSE string_to_array(TG_ARGV[0], ',')
  END;
  IF status_value IN ('approved', 'validated', 'accepted') THEN
    IF TG_OP = 'DELETE'
       OR (to_jsonb(NEW) - lifecycle_columns) IS DISTINCT FROM (to_jsonb(OLD) - lifecycle_columns) THEN
      RAISE EXCEPTION 'governed % content is immutable; create a successor version', TG_TABLE_NAME USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['source_version','record_status,status'],
    ['artifact_version','record_status'],
    ['divergence_case_version',''],
    ['exercise_version',''],
    ['dependency_edge_version','review_status'],
    ['claim_version','review_status'],
    ['role_artifact_exposure','review_status,effective_to'],
    ['change_event_version','status'],
    ['approval_policy','status'],
    ['retention_policy','status']
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.protect_approved_version(%L)',
      item[1] || '_approved_immutable', item[1], item[2]
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- Propagate may persist ordinary artifact impacts, but never people/work-role targets.
CREATE OR REPLACE FUNCTION app.validate_configuration_specific_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'change_impact'
     AND (NEW.person_id IS NOT NULL OR NEW.work_role_id IS NOT NULL)
     AND NOT app.organization_is_displace(NEW.organization_id) THEN
    RAISE EXCEPTION 'people/work-role impacts require Displace configuration' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME IN ('notification', 'notification_preference')
     AND NEW.person_id IS NOT NULL
     AND NOT app.organization_is_displace(NEW.organization_id) THEN
    RAISE EXCEPTION 'person recipients require Displace configuration' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER change_impact_configuration_guard BEFORE INSERT OR UPDATE ON change_impact
FOR EACH ROW EXECUTE FUNCTION app.validate_configuration_specific_row();
--> statement-breakpoint
CREATE TRIGGER notification_configuration_guard BEFORE INSERT OR UPDATE ON notification
FOR EACH ROW EXECUTE FUNCTION app.validate_configuration_specific_row();
--> statement-breakpoint
CREATE TRIGGER notification_preference_configuration_guard BEFORE INSERT OR UPDATE ON notification_preference
FOR EACH ROW EXECUTE FUNCTION app.validate_configuration_specific_row();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_approval_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  policy approval_policy%ROWTYPE;
  object_organization_id uuid;
  object_id_value uuid;
  creator_id uuid;
  requester_id uuid;
BEGIN
  SELECT * INTO policy FROM approval_policy WHERE id = NEW.approval_policy_id FOR SHARE;
  IF policy.id IS NULL
     OR policy.organization_id <> NEW.organization_id
     OR policy.object_type <> NEW.object_type
     OR policy.action <> NEW.action
     OR policy.status <> 'approved' THEN
    RAISE EXCEPTION 'approval policy does not govern this exact action' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM membership member
    JOIN membership_role grant_row ON grant_row.membership_id = member.id
      AND grant_row.organization_id = member.organization_id
      AND grant_row.role_code = NEW.actor_role_code
      AND grant_row.revoked_at IS NULL
    JOIN approval_policy_role eligible_role ON eligible_role.approval_policy_id = policy.id
      AND eligible_role.role_code = grant_row.role_code
    WHERE member.id = NEW.actor_membership_id
      AND member.organization_id = NEW.organization_id
      AND member.status = 'active'
  ) THEN
    RAISE EXCEPTION 'approval actor is not an active eligible role holder' USING ERRCODE = '42501';
  END IF;

  IF policy.require_recent_auth AND NEW.authentication_age_seconds > 900 THEN
    RAISE EXCEPTION 'approval requires authentication within 15 minutes' USING ERRCODE = '42501';
  END IF;
  IF policy.require_mfa AND NOT NEW.mfa_verified THEN
    RAISE EXCEPTION 'approval requires MFA evidence' USING ERRCODE = '42501';
  END IF;

  CASE NEW.object_type
    WHEN 'change_event' THEN
      SELECT version.organization_id, version.change_event_id, version.entered_by_membership_id
        INTO object_organization_id, object_id_value, creator_id
      FROM change_event_version version WHERE version.id = NEW.object_version_id;
    WHEN 'dependency_edge' THEN
      SELECT organization_id, dependency_edge_id, created_by_membership_id
        INTO object_organization_id, object_id_value, creator_id
      FROM dependency_edge_version WHERE id = NEW.object_version_id;
    WHEN 'divergence_case' THEN
      SELECT organization_id, divergence_case_id, created_by_membership_id
        INTO object_organization_id, object_id_value, creator_id
      FROM divergence_case_version WHERE id = NEW.object_version_id;
    WHEN 'exercise' THEN
      SELECT organization_id, exercise_id, created_by_membership_id
        INTO object_organization_id, object_id_value, creator_id
      FROM exercise_version WHERE id = NEW.object_version_id;
    WHEN 'artifact_remediation' THEN
      SELECT organization_id, id, assigned_to_membership_id
        INTO object_organization_id, object_id_value, creator_id
      FROM artifact_remediation
      WHERE id = NEW.object_id AND resolved_artifact_version_id = NEW.object_version_id;
    WHEN 'release_batch' THEN
      SELECT organization_id, id, requested_by_membership_id
        INTO object_organization_id, object_id_value, requester_id
      FROM release_batch WHERE id = NEW.object_version_id;
    WHEN 'report_bundle' THEN
      SELECT organization_id, id, requested_by_membership_id
        INTO object_organization_id, object_id_value, requester_id
      FROM report_bundle WHERE id = NEW.object_version_id;
    WHEN 'retention_policy' THEN
      SELECT organization_id, id, created_by_membership_id
        INTO object_organization_id, object_id_value, creator_id
      FROM retention_policy WHERE id = NEW.object_version_id;
    WHEN 'legal_hold' THEN
      SELECT organization_id, id, created_by_membership_id
        INTO object_organization_id, object_id_value, creator_id
      FROM legal_hold WHERE id = NEW.object_version_id;
    ELSE
      RAISE EXCEPTION 'unsupported approval object type: %', NEW.object_type USING ERRCODE = '23514';
  END CASE;

  IF object_organization_id IS NULL
     OR object_organization_id <> NEW.organization_id
     OR object_id_value <> NEW.object_id THEN
    RAISE EXCEPTION 'approval object/version is missing or belongs to another tenant' USING ERRCODE = '23514';
  END IF;
  IF policy.require_distinct_creator AND creator_id = NEW.actor_membership_id THEN
    RAISE EXCEPTION 'approval actor must differ from creator' USING ERRCODE = '42501';
  END IF;
  IF policy.require_distinct_requester AND requester_id = NEW.actor_membership_id THEN
    RAISE EXCEPTION 'approval actor must differ from requester' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER approval_record_validation_guard
BEFORE INSERT ON approval_record
FOR EACH ROW EXECUTE FUNCTION app.validate_approval_record();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_release_target_person()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE target release_target%ROWTYPE;
BEGIN
  SELECT * INTO target FROM release_target WHERE id = NEW.release_target_id;
  IF target.id IS NULL
     OR target.organization_id <> NEW.organization_id
     OR target.release_batch_id <> NEW.release_batch_id
     OR (target.person_id IS NOT NULL AND target.person_id <> NEW.person_id)
     OR (target.person_id IS NOT NULL AND NEW.resolved_via <> 'direct')
     OR (target.work_role_id IS NOT NULL AND NEW.resolved_via <> 'work_role')
     OR (target.cohort_id IS NOT NULL AND NEW.resolved_via <> 'cohort') THEN
    RAISE EXCEPTION 'resolved release person does not agree with its target' USING ERRCODE = '23514';
  END IF;
  IF target.work_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM person_work_role
    WHERE person_id = NEW.person_id AND work_role_id = target.work_role_id
      AND effective_from <= NEW.resolved_at
      AND (effective_to IS NULL OR effective_to > NEW.resolved_at)
  ) THEN
    RAISE EXCEPTION 'person was not in the work role at audience resolution' USING ERRCODE = '23514';
  END IF;
  IF target.cohort_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cohort_member
    WHERE person_id = NEW.person_id AND cohort_id = target.cohort_id
      AND added_at <= NEW.resolved_at
      AND (removed_at IS NULL OR removed_at > NEW.resolved_at)
  ) THEN
    RAISE EXCEPTION 'person was not in the cohort at audience resolution' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER release_target_person_consistency_guard
BEFORE INSERT OR UPDATE ON release_target_person
FOR EACH ROW EXECUTE FUNCTION app.validate_release_target_person();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_probe_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  case_divergence_id uuid;
  case_change_event_version_id uuid;
  case_status record_status;
  recheck recheck_assignment%ROWTYPE;
BEGIN
  SELECT identity.divergence_id, divergence.change_event_version_id, version.record_status
    INTO case_divergence_id, case_change_event_version_id, case_status
  FROM divergence_case_version version
  JOIN divergence_case identity ON identity.id = version.divergence_case_id
  JOIN divergence ON divergence.id = identity.divergence_id
  LEFT JOIN case_retirement retirement ON retirement.case_version_id = version.id
  WHERE version.id = NEW.case_version_id AND retirement.id IS NULL;

  IF case_status IS DISTINCT FROM 'approved'
     OR case_divergence_id IS DISTINCT FROM NEW.divergence_id
     OR case_change_event_version_id IS DISTINCT FROM NEW.change_event_version_id THEN
    RAISE EXCEPTION 'probe case, divergence, and ChangeEvent must agree and case must be approved/unretired' USING ERRCODE = '23514';
  END IF;

  IF NEW.release_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM release_batch batch
    JOIN release_case content ON content.release_batch_id = batch.id AND content.case_version_id = NEW.case_version_id
    JOIN release_target_person audience ON audience.release_batch_id = batch.id AND audience.person_id = NEW.person_id
    WHERE batch.id = NEW.release_batch_id AND batch.status IN ('authorized', 'releasing', 'released')
  ) THEN
    RAISE EXCEPTION 'probe must use released content and the immutable audience snapshot' USING ERRCODE = '23514';
  END IF;

  IF NEW.recheck_assignment_id IS NOT NULL THEN
    SELECT * INTO recheck FROM recheck_assignment WHERE id = NEW.recheck_assignment_id;
    IF recheck.id IS NULL
       OR recheck.person_id <> NEW.person_id
       OR recheck.divergence_id <> NEW.divergence_id
       OR recheck.selected_case_version_id <> NEW.case_version_id
       OR NEW.assignment_kind <> (CASE recheck.interval_days WHEN 30 THEN 'recheck_30' ELSE 'recheck_90' END) THEN
      RAISE EXCEPTION 'probe does not agree with its durable recheck assignment' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER probe_assignment_consistency_guard
BEFORE INSERT OR UPDATE ON probe_assignment
FOR EACH ROW EXECUTE FUNCTION app.validate_probe_assignment();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_remediation_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trigger_person_id uuid;
  trigger_label assessment_label;
  trigger_release_id uuid;
  trigger_divergence_id uuid;
  current_assessment_id uuid;
BEGIN
  SELECT assignment.person_id, assessment.label, assignment.release_batch_id, assignment.divergence_id
    INTO trigger_person_id, trigger_label, trigger_release_id, trigger_divergence_id
  FROM probe_assessment assessment
  JOIN probe_response response ON response.id = assessment.probe_response_id
  JOIN probe_assignment assignment ON assignment.id = response.probe_assignment_id
  WHERE assessment.id = NEW.trigger_probe_assessment_id;

  SELECT assessment.id INTO current_assessment_id
  FROM probe_assessment assessment
  WHERE assessment.probe_response_id = (
    SELECT probe_response_id FROM probe_assessment WHERE id = NEW.trigger_probe_assessment_id
  )
    AND NOT EXISTS (
      SELECT 1 FROM probe_assessment successor
      WHERE successor.supersedes_probe_assessment_id = assessment.id
    );

  IF trigger_person_id IS DISTINCT FROM NEW.person_id
     OR trigger_label IS DISTINCT FROM 'old'
     OR current_assessment_id IS DISTINCT FROM NEW.trigger_probe_assessment_id
     OR trigger_release_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM release_exercise released
       JOIN exercise_version version ON version.id = released.exercise_version_id
       JOIN exercise identity ON identity.id = version.exercise_id
       WHERE released.release_batch_id = trigger_release_id
         AND released.exercise_version_id = NEW.exercise_version_id
         AND identity.divergence_id = trigger_divergence_id
     ) THEN
    RAISE EXCEPTION 'remediation requires the current old-rule assessment and a released exercise for the same divergence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER remediation_assignment_consistency_guard
BEFORE INSERT OR UPDATE ON remediation_assignment
FOR EACH ROW EXECUTE FUNCTION app.validate_remediation_assignment();
