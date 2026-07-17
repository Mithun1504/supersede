ALTER TABLE organization_domain_policy
  ADD CONSTRAINT organization_domain_policy_constants CHECK (
    graph_max_depth = 8
    AND extraction_auto_review_threshold = 0.800
    AND rewrite_required_threshold = 0.650
    AND aggregate_cohort_minimum = 5
    AND sod_scope = 'per_object'
  );
--> statement-breakpoint

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_domain_policy',
    'person',
    'source',
    'source_version',
    'artifact',
    'artifact_version',
    'document_chunk',
    'claim',
    'claim_version',
    'dependency_edge',
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
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organization_id = app.current_organization_id()) WITH CHECK (organization_id = app.current_organization_id())',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.reject_locked_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION '% version % is locked and immutable', TG_TABLE_NAME, OLD.id
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER source_version_immutable_when_locked
BEFORE UPDATE ON source_version
FOR EACH ROW EXECUTE FUNCTION app.reject_locked_version_update();
--> statement-breakpoint
CREATE TRIGGER artifact_version_immutable_when_locked
BEFORE UPDATE ON artifact_version
FOR EACH ROW EXECUTE FUNCTION app.reject_locked_version_update();
--> statement-breakpoint
CREATE TRIGGER claim_version_immutable_when_locked
BEFORE UPDATE ON claim_version
FOR EACH ROW EXECUTE FUNCTION app.reject_locked_version_update();
--> statement-breakpoint
CREATE TRIGGER dependency_edge_version_immutable_when_locked
BEFORE UPDATE ON dependency_edge_version
FOR EACH ROW EXECUTE FUNCTION app.reject_locked_version_update();
--> statement-breakpoint
CREATE TRIGGER change_event_version_immutable_when_locked
BEFORE UPDATE ON change_event_version
FOR EACH ROW EXECUTE FUNCTION app.reject_locked_version_update();
--> statement-breakpoint
CREATE TRIGGER divergence_case_version_immutable_when_locked
BEFORE UPDATE ON divergence_case_version
FOR EACH ROW EXECUTE FUNCTION app.reject_locked_version_update();
--> statement-breakpoint

CREATE TRIGGER change_impact_append_only
BEFORE UPDATE OR DELETE ON change_impact
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER probe_delivery_event_append_only
BEFORE UPDATE OR DELETE ON probe_delivery_event
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER probe_response_append_only
BEFORE UPDATE OR DELETE ON probe_response
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER remediation_attempt_append_only
BEFORE UPDATE OR DELETE ON remediation_attempt
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER report_bundle_append_only
BEFORE UPDATE OR DELETE ON report_bundle
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.require_displace_configuration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM organization
    WHERE id = NEW.organization_id
      AND product_configuration = 'displace'
  ) THEN
    RAISE EXCEPTION '% requires a Displace organization', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER person_displace_only
BEFORE INSERT OR UPDATE ON person
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
--> statement-breakpoint
CREATE TRIGGER role_artifact_exposure_displace_only
BEFORE INSERT OR UPDATE ON role_artifact_exposure
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
--> statement-breakpoint
CREATE TRIGGER probe_assignment_displace_only
BEFORE INSERT OR UPDATE ON probe_assignment
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
--> statement-breakpoint
CREATE TRIGGER probe_delivery_event_displace_only
BEFORE INSERT OR UPDATE ON probe_delivery_event
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
--> statement-breakpoint
CREATE TRIGGER probe_response_displace_only
BEFORE INSERT OR UPDATE ON probe_response
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
--> statement-breakpoint
CREATE TRIGGER remediation_assignment_displace_only
BEFORE INSERT OR UPDATE ON remediation_assignment
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
--> statement-breakpoint
CREATE TRIGGER remediation_attempt_displace_only
BEFORE INSERT OR UPDATE ON remediation_attempt
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
--> statement-breakpoint
CREATE TRIGGER recheck_assignment_displace_only
BEFORE INSERT OR UPDATE ON recheck_assignment
FOR EACH ROW EXECUTE FUNCTION app.require_displace_configuration();
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

  required_role := CASE NEW.action
    WHEN 'submitted' THEN 'change_owner'
    WHEN 'validated' THEN 'change_validator'
    WHEN 'reviewed' THEN 'edge_reviewer'
    WHEN 'approved' THEN 'case_approver'
    WHEN 'release_authorized' THEN 'release_authorizer'
    WHEN 'exported' THEN 'auditor'
    ELSE NULL
  END;

  IF required_role IS NOT NULL AND NEW.actor_role_code <> required_role THEN
    RAISE EXCEPTION 'approval action % requires role %', NEW.action, required_role
      USING ERRCODE = '42501';
  END IF;

  IF NEW.action IN (
    'submitted',
    'validated',
    'reviewed',
    'approved',
    'release_authorized',
    'exported'
  )
  AND EXISTS (
    SELECT 1
    FROM approval_record previous
    WHERE previous.organization_id = NEW.organization_id
      AND previous.object_type = NEW.object_type
      AND previous.object_id = NEW.object_id
      AND previous.actor_membership_id = NEW.actor_membership_id
      AND previous.action <> NEW.action
  ) THEN
    RAISE EXCEPTION 'separation of duties violation for object %/%', NEW.object_type, NEW.object_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER approval_record_validation
BEFORE INSERT ON approval_record
FOR EACH ROW EXECUTE FUNCTION app.validate_approval_record();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.traverse_dependency_graph(
  root_object_type text,
  root_object_id uuid,
  requested_max_depth integer DEFAULT 8
)
RETURNS TABLE (
  depth integer,
  object_type text,
  object_id uuid,
  path_edge_ids uuid[]
)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE walk AS (
    SELECT
      0 AS depth,
      root_object_type AS object_type,
      root_object_id AS object_id,
      ARRAY[]::uuid[] AS path_edge_ids,
      ARRAY[root_object_type || ':' || root_object_id::text] AS visited
    UNION ALL
    SELECT
      walk.depth + 1,
      edge.from_object_type,
      edge.from_object_id,
      walk.path_edge_ids || edge.id,
      walk.visited || (edge.from_object_type || ':' || edge.from_object_id::text)
    FROM walk
    JOIN dependency_edge edge
      ON edge.organization_id = app.current_organization_id()
     AND edge.to_object_type = walk.object_type
     AND edge.to_object_id = walk.object_id
    WHERE walk.depth < LEAST(requested_max_depth, 8)
      AND NOT (edge.from_object_type || ':' || edge.from_object_id::text) = ANY(walk.visited)
      AND EXISTS (
        SELECT 1
        FROM dependency_edge_version version
        WHERE version.edge_id = edge.id
          AND version.organization_id = edge.organization_id
          AND version.review_status = 'reviewed'
          AND version.locked_at IS NOT NULL
      )
  )
  SELECT depth, object_type, object_id, path_edge_ids
  FROM walk
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supersede_app') THEN
    CREATE ROLE supersede_app NOINHERIT;
  END IF;
END;
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public, app TO supersede_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO supersede_app;
REVOKE INSERT, UPDATE ON role FROM supersede_app;
REVOKE UPDATE ON
  approval_record,
  audit_event,
  change_impact,
  probe_delivery_event,
  probe_response,
  remediation_attempt,
  report_bundle
FROM supersede_app;
GRANT EXECUTE ON FUNCTION app.resolve_actor(text, text) TO supersede_app;
GRANT EXECUTE ON FUNCTION app.current_organization_id() TO supersede_app;
GRANT EXECUTE ON FUNCTION app.current_actor_membership_id() TO supersede_app;
GRANT EXECUTE ON FUNCTION app.traverse_dependency_graph(text, uuid, integer) TO supersede_app;
