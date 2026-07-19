ALTER TABLE "organization" ADD COLUMN "walkthrough_provisioning_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint

UPDATE organization
SET
  public_walkthrough_enabled = false,
  walkthrough_provisioning_enabled = true,
  updated_at = now()
WHERE public_walkthrough_enabled = true;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.provision_walkthrough_actor(
  requested_workos_organization_id text,
  requested_workos_user_id text,
  requested_email text,
  requested_display_name text
)
RETURNS TABLE (organization_id uuid, membership_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  resolved_organization_id uuid;
  resolved_membership_id uuid;
BEGIN
  IF nullif(btrim(requested_workos_organization_id), '') IS NULL
    OR nullif(btrim(requested_workos_user_id), '') IS NULL
    OR nullif(btrim(requested_email), '') IS NULL
    OR nullif(btrim(requested_display_name), '') IS NULL
    OR length(requested_workos_organization_id) > 255
    OR length(requested_workos_user_id) > 255
    OR length(requested_email) > 320
    OR length(requested_display_name) > 255
  THEN
    RAISE EXCEPTION 'Invalid walkthrough actor identity.'
      USING ERRCODE = '22023';
  END IF;

  SELECT id
  INTO resolved_organization_id
  FROM organization
  WHERE workos_organization_id = requested_workos_organization_id
    AND walkthrough_provisioning_enabled = true
  LIMIT 1;

  IF resolved_organization_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO membership (
    organization_id,
    workos_user_id,
    email,
    display_name,
    status,
    updated_at
  )
  VALUES (
    resolved_organization_id,
    requested_workos_user_id,
    requested_email,
    requested_display_name,
    'active',
    now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO resolved_membership_id;

  IF resolved_membership_id IS NULL THEN
    SELECT id
    INTO resolved_membership_id
    FROM membership
    WHERE membership.organization_id = resolved_organization_id
      AND membership.workos_user_id = requested_workos_user_id
      AND membership.status = 'active'
    LIMIT 1;
  END IF;

  IF resolved_membership_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE membership
  SET
    email = requested_email,
    display_name = requested_display_name,
    updated_at = now()
  WHERE id = resolved_membership_id;

  INSERT INTO membership_role (organization_id, membership_id, role_code)
  SELECT
    resolved_organization_id,
    resolved_membership_id,
    demo_role.role_code
  FROM unnest(ARRAY[
    'auditor',
    'case_approver',
    'change_owner',
    'change_validator',
    'edge_reviewer',
    'release_authorizer'
  ]::text[]) AS demo_role(role_code)
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT resolved_organization_id, resolved_membership_id;
END;
$$;
