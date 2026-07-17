-- Displace workflow roles must not appear assignable in Propagate organizations.
UPDATE role
SET configuration_scope = 'displace'
WHERE code IN ('case_approver', 'release_authorizer', 'learner');
--> statement-breakpoint

-- A signed identity-provider webhook needs to resolve an already-provisioned tenant before RLS
-- context can be established. It can learn only the local UUID of an active exact match.
CREATE OR REPLACE FUNCTION app.resolve_webhook_organization(
  p_workos_organization_id text
) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT id
  FROM public.organization
  WHERE workos_organization_id = p_workos_organization_id
    AND status = 'active'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.resolve_webhook_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_webhook_organization(text)
  TO supersede_app, supersede_worker;
