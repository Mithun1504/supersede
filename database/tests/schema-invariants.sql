BEGIN;

DO $$
DECLARE
  expected_tables text[] := ARRAY[
    'organization','organization_settings','membership','role','permission','role_permission',
    'membership_role','service_account','service_account_permission','api_credential',
    'platform_operator','support_access_grant','person','work_role','person_work_role','cohort',
    'cohort_member','corpus','upload_session','storage_object','document_version','document_chunk',
    'source','source_version','artifact','artifact_version','artifact_owner','corpus_source',
    'corpus_artifact','evidence_span','ai_prompt_version','extraction_run','ai_model_run',
    'ai_run_input','ai_run_retrieval_chunk','review_task','review_session','review_action','claim',
    'claim_version','graph_node','dependency_edge','dependency_edge_version','role_artifact_exposure',
    'change_event','change_event_version','change_event_version_citation','propagation_run',
    'change_impact','change_impact_path','change_impact_path_step','artifact_remediation','divergence',
    'divergence_case','divergence_case_version','case_version_citation','case_retirement',
    'release_batch','release_case','release_exercise','release_target','release_target_person',
    'probe_assignment','probe_delivery_event','probe_response','probe_assessment','exercise',
    'exercise_version','remediation_assignment','remediation_attempt','recheck_assignment',
    'approval_policy','approval_policy_role','approval_record','audit_event','report_bundle',
    'report_bundle_item','retention_policy','legal_hold','data_disposition_run','integration_connection',
    'integration_event','integration_job','integration_job_item','notification','notification_preference',
    'notification_delivery','workflow_run','workflow_step','outbox_event','idempotency_record','usage_event'
  ];
  actual_tables text[];
  rls_enabled_count integer;
  rls_forced_count integer;
  policy_count integer;
  foreign_key_count integer;
  tenant_guard_count integer;
  permission_count integer;
  runtime_role_count integer;
BEGIN
  SELECT array_agg(tablename ORDER BY tablename)
    INTO actual_tables
  FROM pg_tables
  WHERE schemaname = 'public';

  SELECT count(*) FILTER (WHERE class.relrowsecurity),
         count(*) FILTER (WHERE class.relforcerowsecurity)
    INTO rls_enabled_count, rls_forced_count
  FROM pg_class class
  JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'public' AND class.relkind = 'r';

  IF EXISTS (
    (SELECT expected.name FROM unnest(expected_tables) AS expected(name)
     EXCEPT SELECT tablename FROM pg_tables WHERE schemaname = 'public')
    UNION ALL
    (SELECT tablename FROM pg_tables WHERE schemaname = 'public'
     EXCEPT SELECT expected.name FROM unnest(expected_tables) AS expected(name))
  ) THEN
    RAISE EXCEPTION 'public table inventory does not match the 92-table SCHEMA.md contract';
  END IF;
  IF cardinality(actual_tables) <> 92 THEN
    RAISE EXCEPTION 'expected 92 public tables, found %', cardinality(actual_tables);
  END IF;
  IF rls_enabled_count <> 87 OR rls_forced_count <> 87 THEN
    RAISE EXCEPTION 'expected RLS enabled and forced on 87 scoped tables; found %/%',
      rls_enabled_count, rls_forced_count;
  END IF;

  SELECT count(*) INTO policy_count FROM pg_policies WHERE schemaname = 'public';
  IF policy_count <> 87 THEN
    RAISE EXCEPTION 'expected one tenant policy per scoped table, found %', policy_count;
  END IF;

  SELECT count(*) INTO foreign_key_count FROM pg_constraint WHERE contype = 'f';
  IF foreign_key_count < 300 THEN
    RAISE EXCEPTION 'foreign-key inventory unexpectedly low: %', foreign_key_count;
  END IF;

  SELECT count(*) INTO tenant_guard_count
  FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'tenant_guard_%';
  IF tenant_guard_count < 200 THEN
    RAISE EXCEPTION 'tenant-equality trigger inventory unexpectedly low: %', tenant_guard_count;
  END IF;

  IF enum_range(NULL::membership_status)::text[] <> ARRAY['invited','active','suspended','deprovisioned'] THEN
    RAISE EXCEPTION 'membership_status enum is incomplete or incorrectly ordered';
  END IF;
  IF NOT ('cancelled' = ANY(enum_range(NULL::workflow_status)::text[])) THEN
    RAISE EXCEPTION 'workflow_status.cancelled is missing';
  END IF;

  SELECT count(*) INTO permission_count FROM permission;
  IF permission_count <> 30 THEN
    RAISE EXCEPTION 'expected 30 stable application permissions, found %', permission_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM role
    WHERE code IN ('case_approver', 'release_authorizer', 'learner')
      AND configuration_scope IS DISTINCT FROM 'displace'
  ) THEN
    RAISE EXCEPTION 'Displace-only role configuration scope is missing';
  END IF;

  SELECT count(*) INTO runtime_role_count
  FROM pg_roles
  WHERE rolname IN ('supersede_app', 'supersede_worker')
    AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin;
  IF runtime_role_count <> 2 THEN
    RAISE EXCEPTION 'hardened runtime group roles are missing or overprivileged';
  END IF;

  IF to_regprocedure('app.resolve_webhook_organization(text)') IS NULL THEN
    RAISE EXCEPTION 'signed webhook tenant resolver is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM role_permission
    WHERE role_code = 'edge_reviewer' AND permission_code = 'artifact.verify'
  ) THEN
    RAISE EXCEPTION 'artifact verification has no initial eligible reviewer capability';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ai_prompt_version
    WHERE task_type = 'claim_extraction'
      AND prompt_version = 'claim_extraction_v1'
      AND schema_version = '1.0.0'
      AND prompt_sha256 = '4bc333060c979f4a241777f705bebfc0f5584ce85deb10f4f5720ee25bd9f01e'
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved claim extraction prompt contract is missing or stale';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ai_prompt_version
    WHERE task_type = 'artifact_feedback'
      AND prompt_version = 'artifact_feedback_v1'
      AND schema_version = '1.0.0'
      AND prompt_sha256 = 'c435aa7565bb165d4a93737ce4dbacacefc8122aa85c2693c238ecd5153d4903'
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved artifact feedback prompt contract is missing or stale';
  END IF;

  IF to_regprocedure('app.resolve_notification_delivery(text)') IS NULL THEN
    RAISE EXCEPTION 'Postmark delivery tenant resolver is missing';
  END IF;

  IF NOT has_function_privilege(
    'supersede_worker',
    'app.active_organization_ids()',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'supersede_app',
    'app.resolve_notification_delivery(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'restricted runtime roles cannot execute required tenant boundary functions';
  END IF;

  IF to_regclass('notification_delivery_notification_channel_uq') IS NULL THEN
    RAISE EXCEPTION 'notification delivery channel idempotency index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ai_prompt_version
    WHERE task_type = 'divergence_case_generation'
      AND prompt_version = 'divergence_case_v1'
      AND schema_version = '1.0.0'
      AND prompt_sha256 = '31e01106e395d74d2d1b23fca5c4cb876bb6557114dccbde4c66d08eb1a0ba96'
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved divergence case prompt contract is missing or stale';
  END IF;
END;
$$;

DO $$
DECLARE
  first_organization_id uuid := gen_random_uuid();
  second_organization_id uuid := gen_random_uuid();
  first_membership_id uuid := gen_random_uuid();
  second_membership_id uuid := gen_random_uuid();
  test_audit_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO organization (id, workos_organization_id, name, product_configuration)
  VALUES
    (first_organization_id, 'schema-test-first', 'Schema Test First', 'displace'),
    (second_organization_id, 'schema-test-second', 'Schema Test Second', 'displace');

  INSERT INTO membership (id, organization_id, workos_user_id, email, display_name, status)
  VALUES
    (first_membership_id, first_organization_id, 'schema-user-first', 'first@example.test', 'First', 'active'),
    (second_membership_id, second_organization_id, 'schema-user-second', 'second@example.test', 'Second', 'active');

  BEGIN
    INSERT INTO membership_role (
      organization_id, membership_id, role_code, granted_by_membership_id
    ) VALUES (
      first_organization_id, second_membership_id, 'org_admin', second_membership_id
    );
    RAISE EXCEPTION 'cross-tenant membership_role insert unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO audit_event (
    id, organization_id, actor_type, actor_membership_id, event_type,
    object_type, object_id, payload
  ) VALUES (
    test_audit_id, first_organization_id, 'membership', first_membership_id,
    'schema.test', 'organization', first_organization_id, '{}'
  );

  BEGIN
    UPDATE audit_event SET payload = '{"mutated":true}' WHERE id = test_audit_id;
    RAISE EXCEPTION 'append-only audit update unexpectedly succeeded';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
