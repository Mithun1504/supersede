ALTER TABLE "organization" ADD COLUMN "public_walkthrough_enabled" boolean DEFAULT false NOT NULL;

CREATE OR REPLACE FUNCTION app.resolve_public_walkthrough()
RETURNS TABLE(organization_id uuid, membership_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT o.id, m.id
  FROM organization o
  JOIN membership m
    ON m.organization_id = o.id
   AND m.status = 'active'
  JOIN membership_role mr
    ON mr.organization_id = o.id
   AND mr.membership_id = m.id
   AND mr.role_code = 'auditor'
  WHERE o.public_walkthrough_enabled = true
  ORDER BY o.created_at ASC, m.created_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_public_walkthrough() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_public_walkthrough() TO supersede_app;
