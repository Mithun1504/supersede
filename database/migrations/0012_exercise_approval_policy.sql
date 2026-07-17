WITH eligible AS (
  SELECT o.id AS organization_id,
         (
           SELECT mr.membership_id
           FROM membership_role mr
           WHERE mr.organization_id = o.id
             AND mr.role_code = 'org_admin'
             AND mr.revoked_at IS NULL
           ORDER BY mr.granted_at
           LIMIT 1
         ) AS creator_id
  FROM organization o
  WHERE o.product_configuration = 'displace'
    AND NOT EXISTS (
      SELECT 1 FROM approval_policy ap
      WHERE ap.organization_id = o.id
        AND ap.object_type = 'correction_exercise'
        AND ap.action = 'approve'
        AND ap.status = 'approved'
    )
), inserted AS (
  INSERT INTO approval_policy (
    organization_id, object_type, action, minimum_approvals,
    require_distinct_creator, require_distinct_requester,
    require_recent_auth, require_mfa, status, version_number,
    effective_from, created_by_membership_id
  )
  SELECT organization_id, 'correction_exercise', 'approve', 1,
         true, false, true, false, 'approved', 1, now(), creator_id
  FROM eligible
  WHERE creator_id IS NOT NULL
  RETURNING id, organization_id
)
INSERT INTO approval_policy_role (organization_id, approval_policy_id, role_code)
SELECT organization_id, id, 'case_approver' FROM inserted;
--> statement-breakpoint
WITH eligible AS (
  SELECT o.id AS organization_id,
         (
           SELECT mr.membership_id
           FROM membership_role mr
           WHERE mr.organization_id = o.id
             AND mr.role_code = 'org_admin'
             AND mr.revoked_at IS NULL
           ORDER BY mr.granted_at
           LIMIT 1
         ) AS creator_id
  FROM organization o
  WHERE o.product_configuration = 'displace'
    AND NOT EXISTS (
      SELECT 1 FROM approval_policy ap
      WHERE ap.organization_id = o.id
        AND ap.object_type = 'divergence_case'
        AND ap.action = 'retire'
        AND ap.status = 'approved'
    )
), inserted AS (
  INSERT INTO approval_policy (
    organization_id, object_type, action, minimum_approvals,
    require_distinct_creator, require_distinct_requester,
    require_recent_auth, require_mfa, status, version_number,
    effective_from, created_by_membership_id
  )
  SELECT organization_id, 'divergence_case', 'retire', 1,
         false, false, true, false, 'approved', 1, now(), creator_id
  FROM eligible
  WHERE creator_id IS NOT NULL
  RETURNING id, organization_id
)
INSERT INTO approval_policy_role (organization_id, approval_policy_id, role_code)
SELECT organization_id, id, 'case_approver' FROM inserted;
