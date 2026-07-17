-- Scheduled workers must discover tenant IDs without disabling table RLS in application code.
-- The zero-argument, read-only security-definer function exposes IDs only; every unit of work
-- re-enters a tenant-scoped transaction before reading or mutating tenant data.
CREATE OR REPLACE FUNCTION app.active_organization_ids()
RETURNS TABLE (organization_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM organization
  WHERE status = 'active'
  ORDER BY id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.active_organization_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.active_organization_ids() TO supersede_app, supersede_worker;
