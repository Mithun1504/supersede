CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_actor_membership_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.actor_membership_id', true), '')::uuid
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.resolve_actor(
  requested_workos_organization_id text,
  requested_workos_user_id text
)
RETURNS TABLE (organization_id uuid, membership_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization.id, membership.id
  FROM organization
  JOIN membership ON membership.organization_id = organization.id
  WHERE organization.workos_organization_id = requested_workos_organization_id
    AND membership.workos_user_id = requested_workos_user_id
    AND membership.status = 'active'
  LIMIT 1
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.resolve_actor(text, text) FROM PUBLIC;
--> statement-breakpoint

INSERT INTO role (code, description)
VALUES
  ('org_admin', 'Organization configuration and membership administration'),
  ('change_owner', 'Creates and submits source change events'),
  ('change_validator', 'Validates a change event created by another actor'),
  ('edge_reviewer', 'Reviews extracted dependency edges and evidence'),
  ('case_approver', 'Approves an immutable divergence-case version'),
  ('release_authorizer', 'Authorizes release to affected users'),
  ('auditor', 'Reads audit records and creates permitted exports'),
  ('learner', 'Completes assigned probes and remediation exercises')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY organization_tenant_isolation ON organization
  USING (id = app.current_organization_id())
  WITH CHECK (id = app.current_organization_id());
--> statement-breakpoint
CREATE POLICY membership_tenant_isolation ON membership
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
--> statement-breakpoint
CREATE POLICY membership_role_tenant_isolation ON membership_role
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
--> statement-breakpoint
CREATE POLICY approval_record_tenant_isolation ON approval_record
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
--> statement-breakpoint
CREATE POLICY audit_event_tenant_isolation ON audit_event
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
--> statement-breakpoint
CREATE POLICY outbox_event_tenant_isolation ON outbox_event
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
--> statement-breakpoint
CREATE POLICY workflow_run_tenant_isolation ON workflow_run
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
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

CREATE TRIGGER approval_record_append_only
BEFORE UPDATE OR DELETE ON approval_record
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_event_append_only
BEFORE UPDATE OR DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.validate_membership_role_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM membership
    WHERE membership.id = NEW.membership_id
      AND membership.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'membership role organization mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER membership_role_organization_guard
BEFORE INSERT OR UPDATE ON membership_role
FOR EACH ROW EXECUTE FUNCTION app.validate_membership_role_organization();
--> statement-breakpoint

ALTER TABLE workflow_run
  ADD CONSTRAINT workflow_run_progress_current_nonnegative CHECK (progress_current >= 0),
  ADD CONSTRAINT workflow_run_progress_total_nonnegative CHECK (progress_total IS NULL OR progress_total >= 0),
  ADD CONSTRAINT workflow_run_progress_order CHECK (progress_total IS NULL OR progress_current <= progress_total);
