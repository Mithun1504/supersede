CREATE OR REPLACE FUNCTION app.validate_recheck_case_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'blocked_case_required' AND NEW.case_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'blocked recheck cannot have a case version'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status <> 'blocked_case_required' AND NEW.case_version_id IS NULL THEN
    RAISE EXCEPTION 'scheduled recheck requires a distinct case version'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.case_version_id IS NOT NULL AND (
    (
      NEW.remediation_assignment_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM remediation_assignment remediation
        JOIN probe_response response ON response.id = remediation.probe_response_id
        JOIN probe_assignment original ON original.id = response.assignment_id
        WHERE remediation.id = NEW.remediation_assignment_id
          AND remediation.organization_id = NEW.organization_id
          AND remediation.person_id = NEW.person_id
          AND original.change_event_version_id = NEW.change_event_version_id
          AND original.case_version_id = NEW.case_version_id
      )
    )
    OR (
      NEW.remediation_assignment_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM probe_assignment original
        WHERE original.organization_id = NEW.organization_id
          AND original.person_id = NEW.person_id
          AND original.change_event_version_id = NEW.change_event_version_id
          AND original.case_version_id = NEW.case_version_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'recheck case must differ from the original probe case'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
