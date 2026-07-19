BEGIN;

DO $$
DECLARE
  policy_count integer;
  append_only_trigger_count integer;
  locked_trigger_count integer;
  displace_trigger_count integer;
  organization_guard_count integer;
  runtime_role_count integer;
  org_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  validator_id uuid := gen_random_uuid();
  edge_reviewer_id uuid := gen_random_uuid();
  case_author_id uuid := gen_random_uuid();
  case_approver_id uuid := gen_random_uuid();
  release_id uuid := gen_random_uuid();
  source_id uuid := gen_random_uuid();
  old_source_version_id uuid := gen_random_uuid();
  new_source_version_id uuid := gen_random_uuid();
  change_id uuid := gen_random_uuid();
  change_version_id uuid := gen_random_uuid();
  case_id uuid := gen_random_uuid();
  case_version_id uuid := gen_random_uuid();
  alternate_case_id uuid := gen_random_uuid();
  alternate_case_version_id uuid := gen_random_uuid();
  edge_id uuid := gen_random_uuid();
  edge_version_id uuid := gen_random_uuid();
  professional_role_id uuid := gen_random_uuid();
  person_id uuid := gen_random_uuid();
  probe_assignment_id uuid := gen_random_uuid();
  claimed_rechecks integer;
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
      'workflow_run',
      'workflow_step',
      'organization_domain_policy',
      'professional_role',
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
    );

  IF policy_count <> 34 THEN
    RAISE EXCEPTION 'expected 34 tenant policies, found %', policy_count;
  END IF;

  SELECT count(*)
  INTO append_only_trigger_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN (
      'approval_record_append_only',
      'audit_event_append_only',
      'change_impact_append_only',
      'probe_delivery_event_append_only',
      'probe_response_append_only',
      'remediation_attempt_append_only',
      'report_bundle_append_only'
    );

  IF append_only_trigger_count <> 7 THEN
    RAISE EXCEPTION 'append-only triggers are missing';
  END IF;

  SELECT count(*)
  INTO locked_trigger_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname LIKE '%_immutable_when_locked';

  IF locked_trigger_count <> 6 THEN
    RAISE EXCEPTION 'locked-version triggers are missing';
  END IF;

  SELECT count(*)
  INTO displace_trigger_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname LIKE '%_displace_only';

  IF displace_trigger_count <> 9 THEN
    RAISE EXCEPTION 'Displace-only triggers are missing';
  END IF;

  SELECT count(*)
  INTO organization_guard_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname LIKE '%_organization_guard';

  IF organization_guard_count <> 24 THEN
    RAISE EXCEPTION 'organization parent guard triggers are missing';
  END IF;

  SELECT count(*)
  INTO runtime_role_count
  FROM pg_roles
  WHERE rolname = 'supersede_app'
    AND NOT rolbypassrls
    AND NOT rolsuper;

  IF runtime_role_count <> 1 THEN
    RAISE EXCEPTION 'non-owner runtime role is missing or over-privileged';
  END IF;

  IF NOT (
    has_table_privilege('supersede_app', 'professional_role', 'SELECT')
    AND has_table_privilege('supersede_app', 'professional_role', 'INSERT')
    AND has_table_privilege('supersede_app', 'professional_role', 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'professional role runtime grants are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_domain_policy_constants'
  ) THEN
    RAISE EXCEPTION 'domain policy constants constraint is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'app'
      AND pg_proc.proname = 'traverse_dependency_graph'
  ) THEN
    RAISE EXCEPTION 'graph traversal helper is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'change_event_source_id_source_id_fk'
  ) THEN
    RAISE EXCEPTION 'change_event.source_id foreign key is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('person', 'role_artifact_exposure')
      AND column_name = 'role_code'
  ) THEN
    RAISE EXCEPTION 'professional mapping still uses auth role_code';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'person'
      AND column_name = 'professional_role_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'person.professional_role_id is missing or nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recheck_assignment'
      AND column_name = 'case_version_id'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'recheck_assignment.case_version_id must allow blocked rows';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recheck_assignment'
      AND column_name = 'remediation_assignment_id'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'recheck_assignment.remediation_assignment_id is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'document_chunk'
      AND indexname = 'document_chunk_embedding_hnsw_idx'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'document_chunk'
      AND indexname = 'document_chunk_search_vector_gin_idx'
  ) THEN
    RAISE EXCEPTION 'hybrid retrieval indexes are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'recheck_status'
      AND pg_enum.enumlabel = 'blocked_case_required'
  ) THEN
    RAISE EXCEPTION 'blocked_case_required recheck status is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname = 'recheck_assignment_case_policy'
  ) THEN
    RAISE EXCEPTION 'recheck case policy trigger is missing';
  END IF;

  IF NOT (
    has_function_privilege('supersede_app', 'app.claim_outbox_events(integer, integer)', 'EXECUTE')
    AND has_function_privilege('supersede_app', 'app.mark_outbox_event_published(uuid)', 'EXECUTE')
    AND has_function_privilege('supersede_app', 'app.release_outbox_event(uuid, text, integer, boolean)', 'EXECUTE')
    AND has_function_privilege('supersede_app', 'app.claim_due_rechecks(integer)', 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'scheduler function grants are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'app'
      AND pg_proc.proname IN (
        'claim_outbox_events',
        'mark_outbox_event_published',
        'release_outbox_event',
        'claim_due_rechecks'
      )
      AND NOT pg_proc.prosecdef
  ) THEN
    RAISE EXCEPTION 'scheduler functions must be SECURITY DEFINER';
  END IF;

  INSERT INTO organization (
    id,
    workos_organization_id,
    name,
    product_configuration,
    individual_results_visible
  )
  VALUES (org_id, 'org_test_approval_policy', 'Approval Policy Test', 'displace', true);

  INSERT INTO membership (id, organization_id, workos_user_id, email, display_name)
  VALUES
    (owner_id, org_id, 'owner', 'owner@example.test', 'Owner'),
    (validator_id, org_id, 'validator', 'validator@example.test', 'Validator'),
    (edge_reviewer_id, org_id, 'edge', 'edge@example.test', 'Edge Reviewer'),
    (case_author_id, org_id, 'author', 'author@example.test', 'Case Author'),
    (case_approver_id, org_id, 'approver', 'approver@example.test', 'Case Approver'),
    (release_id, org_id, 'release', 'release@example.test', 'Release');

  INSERT INTO membership_role (organization_id, membership_id, role_code)
  VALUES
    (org_id, owner_id, 'change_owner'),
    (org_id, owner_id, 'change_validator'),
    (org_id, validator_id, 'change_validator'),
    (org_id, edge_reviewer_id, 'edge_reviewer'),
    (org_id, case_author_id, 'case_approver'),
    (org_id, case_approver_id, 'case_approver'),
    (org_id, release_id, 'release_authorizer');

  INSERT INTO source (id, organization_id, kind, canonical_key, title)
  VALUES (source_id, org_id, 'guideline', 'approval-test-source', 'Approval Test Source');

  INSERT INTO source_version (
    id,
    organization_id,
    source_id,
    version_label,
    status,
    effective_date,
    file_sha256,
    summary
  )
  VALUES
    (old_source_version_id, org_id, source_id, 'old', 'superseded', '2026-01-01', repeat('a', 64), 'old'),
    (new_source_version_id, org_id, source_id, 'new', 'active', '2026-02-01', repeat('b', 64), 'new');

  INSERT INTO change_event (
    id,
    organization_id,
    source_id,
    entered_by_membership_id
  )
  VALUES (change_id, org_id, source_id, owner_id);

  INSERT INTO change_event_version (
    id,
    organization_id,
    change_event_id,
    old_source_version_id,
    new_source_version_id,
    version_label,
    old_rule,
    new_rule,
    affected_population,
    diff_summary
  )
  VALUES (
    change_version_id,
    org_id,
    change_id,
    old_source_version_id,
    new_source_version_id,
    'v1',
    'old',
    'new',
    'test',
    '{}'::jsonb
  );

  INSERT INTO dependency_edge (
    id,
    organization_id,
    kind,
    from_object_type,
    from_object_id,
    to_object_type,
    to_object_id
  )
  VALUES (
    edge_id,
    org_id,
    'supports',
    'claim_version',
    gen_random_uuid(),
    'source_version',
    old_source_version_id
  );

  INSERT INTO dependency_edge_version (
    id,
    organization_id,
    edge_id,
    version_label,
    evidence_document_version_id,
    evidence_quote,
    evidence_start_offset,
    evidence_end_offset,
    evidence_checksum,
    confidence
  )
  VALUES (
    edge_version_id,
    org_id,
    edge_id,
    'v1',
    old_source_version_id,
    'quote',
    0,
    5,
    repeat('c', 64),
    0.9
  );

  INSERT INTO divergence_case (id, organization_id, change_event_id)
  VALUES (case_id, org_id, change_id);

  INSERT INTO divergence_case_version (
    id,
    organization_id,
    case_id,
    change_event_version_id,
    version_label,
    scenario,
    old_answer,
    new_answer,
    rationale,
    old_citation,
    new_citation,
    authored_by_membership_id
  )
  VALUES (
    case_version_id,
    org_id,
    case_id,
    change_version_id,
    'v1',
    'scenario',
    'old',
    'new',
    'rationale',
    '{}'::jsonb,
    '{}'::jsonb,
    case_author_id
  );

  INSERT INTO divergence_case (id, organization_id, change_event_id)
  VALUES (alternate_case_id, org_id, change_id);

  INSERT INTO divergence_case_version (
    id,
    organization_id,
    case_id,
    change_event_version_id,
    version_label,
    scenario,
    old_answer,
    new_answer,
    rationale,
    old_citation,
    new_citation,
    authored_by_membership_id
  )
  VALUES (
    alternate_case_version_id,
    org_id,
    alternate_case_id,
    change_version_id,
    'v1',
    'alternate scenario',
    'old',
    'new',
    'alternate rationale',
    '{}'::jsonb,
    '{}'::jsonb,
    case_author_id
  );

  INSERT INTO professional_role (
    id,
    organization_id,
    code,
    display_name,
    description
  )
  VALUES (
    professional_role_id,
    org_id,
    'test_role',
    'Test Role',
    'Test professional role.'
  );

  INSERT INTO person (
    id,
    organization_id,
    external_key,
    display_name,
    professional_role_id
  )
  VALUES (
    person_id,
    org_id,
    'test-person',
    'Test Person',
    professional_role_id
  );

  INSERT INTO probe_assignment (
    id,
    organization_id,
    person_id,
    case_version_id,
    change_event_version_id
  )
  VALUES (
    probe_assignment_id,
    org_id,
    person_id,
    case_version_id,
    change_version_id
  );

  BEGIN
    INSERT INTO recheck_assignment (
      organization_id,
      person_id,
      change_event_version_id,
      case_version_id,
      due_on
    )
    VALUES (
      org_id,
      person_id,
      change_version_id,
      case_version_id,
      current_date
    );
    RAISE EXCEPTION 'recheck reused original probe case';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO recheck_assignment (
    organization_id,
    person_id,
    change_event_version_id,
    case_version_id,
    due_on,
    status
  )
  VALUES (
    org_id,
    person_id,
    change_version_id,
    NULL,
    current_date - 2,
    'blocked_case_required'
  );

  INSERT INTO recheck_assignment (
    organization_id,
    person_id,
    change_event_version_id,
    case_version_id,
    due_on
  )
  VALUES (
    org_id,
    person_id,
    change_version_id,
    alternate_case_version_id,
    current_date - 1
  );

  SELECT count(*)
  INTO claimed_rechecks
  FROM app.claim_due_rechecks(10);

  IF claimed_rechecks <> 1 THEN
    RAISE EXCEPTION 'expected one due recheck to be claimed, found %', claimed_rechecks;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM audit_event
    WHERE organization_id = org_id
      AND event_type = 'recheck.dispatch.requested'
      AND object_type = 'recheck_assignment'
  ) THEN
    RAISE EXCEPTION 'recheck dispatch audit event was not inserted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM outbox_event
    WHERE organization_id = org_id
      AND event_name = 'recheck.dispatch.requested'
      AND aggregate_type = 'recheck_assignment'
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'recheck dispatch outbox event was not inserted';
  END IF;

  INSERT INTO approval_record (
    organization_id,
    actor_membership_id,
    actor_role_code,
    object_type,
    object_id,
    object_version_id,
    action
  )
  VALUES
    (org_id, validator_id, 'change_validator', 'change_event', change_id, change_version_id, 'change_validated'),
    (org_id, edge_reviewer_id, 'edge_reviewer', 'dependency_edge', edge_id, edge_version_id, 'edge_accepted'),
    (org_id, case_approver_id, 'case_approver', 'divergence_case', case_id, case_version_id, 'case_approved'),
    (org_id, release_id, 'release_authorizer', 'divergence_case', case_id, case_version_id, 'release_authorized');

  BEGIN
    INSERT INTO approval_record (
      organization_id,
      actor_membership_id,
      actor_role_code,
      object_type,
      object_id,
      object_version_id,
      action
    )
    VALUES (org_id, owner_id, 'change_owner', 'change_event', change_id, change_version_id, 'submitted');
    RAISE EXCEPTION 'submitted was incorrectly accepted as an approval';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO approval_record (
      organization_id,
      actor_membership_id,
      actor_role_code,
      object_type,
      object_id,
      object_version_id,
      action
    )
    VALUES (org_id, owner_id, 'change_validator', 'change_event', change_id, change_version_id, 'change_validated');
    RAISE EXCEPTION 'change owner was allowed to validate own change';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO approval_record (
      organization_id,
      actor_membership_id,
      actor_role_code,
      object_type,
      object_id,
      object_version_id,
      action
    )
    VALUES (org_id, case_author_id, 'case_approver', 'divergence_case', case_id, case_version_id, 'case_approved');
    RAISE EXCEPTION 'case author was allowed to approve own case';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO membership_role (organization_id, membership_id, role_code)
    VALUES (org_id, case_approver_id, 'release_authorizer')
    ON CONFLICT DO NOTHING;

    INSERT INTO approval_record (
      organization_id,
      actor_membership_id,
      actor_role_code,
      object_type,
      object_id,
      object_version_id,
      action
    )
    VALUES (org_id, case_approver_id, 'release_authorizer', 'divergence_case', case_id, case_version_id, 'release_authorized');
    RAISE EXCEPTION 'case approver was allowed to authorize release';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
