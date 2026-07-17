-- Stable capability catalog. Application services authorize permissions, never client role strings.
INSERT INTO permission (code, description, configuration_scope, privileged)
VALUES
  ('organization.read', 'Read organization settings and setup state', NULL, false),
  ('organization.manage', 'Manage organization policy and presentation settings', NULL, true),
  ('membership.read', 'Read tenant memberships and role grants', NULL, false),
  ('membership.manage', 'Invite, suspend, deprovision, and assign roles', NULL, true),
  ('service_account.manage', 'Manage service accounts and credentials', NULL, true),
  ('approval_policy.manage', 'Manage approval policy versions and eligible roles', NULL, true),
  ('corpus.read', 'Read authorized corpus, source, artifact, and evidence records', NULL, false),
  ('corpus.write', 'Create corpus content and governed source or artifact versions', NULL, false),
  ('edge.review', 'Review claims, citations, dependency edges, and exposure mappings', NULL, false),
  ('change.read', 'Read ChangeEvents, propagation results, and artifact tasks', NULL, false),
  ('change.write', 'Draft and submit ChangeEvent versions', NULL, false),
  ('change.validate', 'Validate an eligible ChangeEvent version', NULL, true),
  ('artifact.remediate_owned', 'Submit remediation for an explicitly owned artifact', NULL, false),
  ('artifact.verify', 'Verify governed artifact remediation', NULL, true),
  ('people.read', 'Read policy-authorized people, roles, cohorts, and exposure', 'displace', false),
  ('people.manage', 'Manage people, roles, cohorts, and import operations', 'displace', true),
  ('case.read', 'Read divergence cases and exercises', 'displace', false),
  ('case.approve', 'Approve or retire exact divergence case and exercise versions', 'displace', true),
  ('release.prepare', 'Prepare release content and immutable audience snapshots', 'displace', false),
  ('release.authorize', 'Authorize an exact release content and audience snapshot', 'displace', true),
  ('learning.complete', 'Read and complete only personally assigned learning work', 'displace', false),
  ('result.read_aggregate', 'Read privacy-safe aggregate observable outcomes', 'displace', false),
  ('result.read_individual', 'Read authorized individual observable outcomes', 'displace', true),
  ('audit.read', 'Read append-only approval and audit timelines', NULL, false),
  ('report.export', 'Request and retrieve policy-permitted report bundles', NULL, true),
  ('retention.manage', 'Manage retention policies, legal holds, and disposition', NULL, true),
  ('integration.manage', 'Manage integration connections, imports, and delivery adapters', NULL, true),
  ('operations.read', 'Read workflow, provider health, usage, and failure state', NULL, false),
  ('operations.retry', 'Retry eligible failed or paused workflow steps', NULL, true),
  ('support.grant', 'Approve or revoke time-limited support access', NULL, true)
ON CONFLICT (code) DO UPDATE
SET description = EXCLUDED.description,
    configuration_scope = EXCLUDED.configuration_scope,
    privileged = EXCLUDED.privileged;
--> statement-breakpoint

INSERT INTO role_permission (role_code, permission_code)
VALUES
  ('org_admin', 'organization.read'), ('org_admin', 'organization.manage'),
  ('org_admin', 'membership.read'), ('org_admin', 'membership.manage'),
  ('org_admin', 'service_account.manage'), ('org_admin', 'approval_policy.manage'),
  ('org_admin', 'corpus.read'), ('org_admin', 'people.read'), ('org_admin', 'people.manage'),
  ('org_admin', 'result.read_aggregate'), ('org_admin', 'audit.read'),
  ('org_admin', 'retention.manage'), ('org_admin', 'integration.manage'),
  ('org_admin', 'operations.read'), ('org_admin', 'operations.retry'),
  ('org_admin', 'support.grant'),
  ('change_owner', 'corpus.read'), ('change_owner', 'corpus.write'),
  ('change_owner', 'change.read'), ('change_owner', 'change.write'),
  ('change_owner', 'artifact.remediate_owned'), ('change_owner', 'audit.read'),
  ('change_validator', 'corpus.read'), ('change_validator', 'change.read'),
  ('change_validator', 'change.validate'), ('change_validator', 'audit.read'),
  ('edge_reviewer', 'corpus.read'), ('edge_reviewer', 'edge.review'),
  ('edge_reviewer', 'change.read'), ('edge_reviewer', 'people.read'),
  ('case_approver', 'corpus.read'), ('case_approver', 'change.read'),
  ('case_approver', 'case.read'), ('case_approver', 'case.approve'),
  ('release_authorizer', 'change.read'), ('release_authorizer', 'case.read'),
  ('release_authorizer', 'people.read'), ('release_authorizer', 'release.prepare'),
  ('release_authorizer', 'release.authorize'), ('release_authorizer', 'result.read_aggregate'),
  ('auditor', 'organization.read'), ('auditor', 'corpus.read'),
  ('auditor', 'change.read'), ('auditor', 'case.read'),
  ('auditor', 'result.read_aggregate'), ('auditor', 'audit.read'),
  ('auditor', 'report.export'), ('auditor', 'operations.read'),
  ('learner', 'learning.complete')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Group roles are deliberately NOLOGIN. Neon/Vercel runtime login roles are granted membership
-- out-of-band, keeping credentials separate from schema ownership.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supersede_app') THEN
    CREATE ROLE supersede_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supersede_worker') THEN
    CREATE ROLE supersede_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END;
$$;
--> statement-breakpoint

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO supersede_app, supersede_worker', current_database());
END;
$$;
GRANT USAGE ON SCHEMA public, app TO supersede_app, supersede_worker;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO supersede_app, supersede_worker;
REVOKE UPDATE, DELETE ON approval_record, audit_event, review_action, case_retirement,
  probe_delivery_event, probe_response, usage_event FROM supersede_app, supersede_worker;
REVOKE INSERT, UPDATE, DELETE ON role, permission, role_permission, ai_prompt_version,
  platform_operator FROM supersede_app, supersede_worker;
GRANT SELECT ON role, permission, role_permission, ai_prompt_version TO supersede_app, supersede_worker;
REVOKE ALL ON FUNCTION app.resolve_actor(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_actor(text, text) TO supersede_app, supersede_worker;
GRANT EXECUTE ON FUNCTION app.current_organization_id(), app.current_actor_membership_id()
  TO supersede_app, supersede_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO supersede_app, supersede_worker;
