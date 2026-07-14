BEGIN;

DO $$
DECLARE
  policy_count integer;
  append_only_trigger_count integer;
BEGIN
  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'organization',
      'membership',
      'membership_role',
      'approval_record',
      'audit_event',
      'outbox_event',
      'workflow_run'
    );

  IF policy_count <> 7 THEN
    RAISE EXCEPTION 'expected 7 tenant policies, found %', policy_count;
  END IF;

  SELECT count(*)
  INTO append_only_trigger_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('approval_record_append_only', 'audit_event_append_only');

  IF append_only_trigger_count <> 2 THEN
    RAISE EXCEPTION 'append-only triggers are missing';
  END IF;
END;
$$;

ROLLBACK;
