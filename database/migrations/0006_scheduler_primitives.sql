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

  IF NEW.case_version_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM probe_assignment
    WHERE probe_assignment.organization_id = NEW.organization_id
      AND probe_assignment.person_id = NEW.person_id
      AND probe_assignment.change_event_version_id = NEW.change_event_version_id
      AND probe_assignment.case_version_id = NEW.case_version_id
  ) THEN
    RAISE EXCEPTION 'recheck case must differ from the original probe case'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER recheck_assignment_case_policy
BEFORE INSERT OR UPDATE ON recheck_assignment
FOR EACH ROW EXECUTE FUNCTION app.validate_recheck_case_policy();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.claim_outbox_events(
  batch_size integer DEFAULT 50,
  lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  event_name varchar,
  aggregate_type varchar,
  aggregate_id uuid,
  payload jsonb,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT outbox_event.id
    FROM outbox_event
    WHERE outbox_event.status = 'pending'
      AND outbox_event.available_at <= now()
    ORDER BY outbox_event.available_at, outbox_event.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(batch_size, 1), 500)
  )
  UPDATE outbox_event
  SET attempts = outbox_event.attempts + 1,
      available_at = now() + make_interval(secs => LEAST(GREATEST(lease_seconds, 30), 3600)),
      last_error = NULL
  FROM candidate
  WHERE outbox_event.id = candidate.id
  RETURNING
    outbox_event.id,
    outbox_event.organization_id,
    outbox_event.event_name,
    outbox_event.aggregate_type,
    outbox_event.aggregate_id,
    outbox_event.payload,
    outbox_event.attempts;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.mark_outbox_event_published(event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  UPDATE outbox_event
  SET status = 'published',
      published_at = now(),
      last_error = NULL
  WHERE outbox_event.id = event_id
    AND outbox_event.status = 'pending';

  RETURN FOUND;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.release_outbox_event(
  event_id uuid,
  error_summary text,
  retry_after_seconds integer DEFAULT 60,
  terminal boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  UPDATE outbox_event
  SET status = CASE WHEN terminal THEN 'failed'::outbox_status ELSE 'pending'::outbox_status END,
      available_at = CASE
        WHEN terminal THEN outbox_event.available_at
        ELSE now() + make_interval(secs => LEAST(GREATEST(retry_after_seconds, 5), 3600))
      END,
      last_error = left(error_summary, 2000)
  WHERE outbox_event.id = event_id
    AND outbox_event.status = 'pending';

  RETURN FOUND;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.claim_due_rechecks(batch_size integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  person_id uuid,
  change_event_version_id uuid,
  case_version_id uuid,
  due_on date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT recheck_assignment.id
    FROM recheck_assignment
    WHERE recheck_assignment.status = 'scheduled'
      AND recheck_assignment.case_version_id IS NOT NULL
      AND recheck_assignment.due_on <= current_date
    ORDER BY recheck_assignment.due_on, recheck_assignment.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(batch_size, 1), 500)
  ),
  claimed AS (
    UPDATE recheck_assignment
    SET status = 'assigned'
    FROM candidate
    WHERE recheck_assignment.id = candidate.id
    RETURNING
      recheck_assignment.id,
      recheck_assignment.organization_id,
      recheck_assignment.person_id,
      recheck_assignment.change_event_version_id,
      recheck_assignment.case_version_id,
      recheck_assignment.due_on
  ),
  audit_insert AS (
    INSERT INTO audit_event (
      organization_id,
      event_type,
      object_type,
      object_id,
      object_version_id,
      payload
    )
    SELECT
      claimed.organization_id,
      'recheck.dispatch.requested',
      'recheck_assignment',
      claimed.id,
      claimed.case_version_id,
      jsonb_build_object(
        'personId', claimed.person_id,
        'changeEventVersionId', claimed.change_event_version_id,
        'dueOn', claimed.due_on
      )
    FROM claimed
    RETURNING audit_event.id
  ),
  outbox_insert AS (
    INSERT INTO outbox_event (
      organization_id,
      event_name,
      aggregate_type,
      aggregate_id,
      idempotency_key,
      payload
    )
    SELECT
      claimed.organization_id,
      'recheck.dispatch.requested',
      'recheck_assignment',
      claimed.id,
      'recheck.dispatch.requested:' || claimed.id::text,
      jsonb_build_object(
        'recheckAssignmentId', claimed.id,
        'personId', claimed.person_id,
        'changeEventVersionId', claimed.change_event_version_id,
        'caseVersionId', claimed.case_version_id,
        'dueOn', claimed.due_on
      )
    FROM claimed
    WHERE NOT EXISTS (
      SELECT 1
      FROM outbox_event existing
      WHERE existing.organization_id = claimed.organization_id
        AND existing.idempotency_key = 'recheck.dispatch.requested:' || claimed.id::text
    )
    RETURNING outbox_event.id
  )
  SELECT
    claimed.id,
    claimed.organization_id,
    claimed.person_id,
    claimed.change_event_version_id,
    claimed.case_version_id,
    claimed.due_on
  FROM claimed
  WHERE EXISTS (SELECT 1 FROM audit_insert)
    AND EXISTS (SELECT 1 FROM outbox_insert);
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.claim_outbox_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mark_outbox_event_published(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.release_outbox_event(uuid, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.claim_due_rechecks(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_outbox_events(integer, integer) TO supersede_app;
GRANT EXECUTE ON FUNCTION app.mark_outbox_event_published(uuid) TO supersede_app;
GRANT EXECUTE ON FUNCTION app.release_outbox_event(uuid, text, integer, boolean) TO supersede_app;
GRANT EXECUTE ON FUNCTION app.claim_due_rechecks(integer) TO supersede_app;
