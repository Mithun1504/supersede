import { pgEnum } from "drizzle-orm/pg-core";

export const productConfiguration = pgEnum("product_configuration", [
  "propagate",
  "displace",
]);
export const entityStatus = pgEnum("entity_status", [
  "active",
  "inactive",
  "retired",
]);
export const recordStatus = pgEnum("record_status", [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "superseded",
  "retired",
]);
export const membershipStatus = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "deprovisioned",
]);
export const personStatus = pgEnum("person_status", [
  "active",
  "inactive",
  "deprovisioned",
]);
export const sourceKind = pgEnum("source_kind", [
  "guideline",
  "regulation",
  "paper",
  "standard",
  "internal_policy",
]);
export const sourceVersionStatus = pgEnum("source_version_status", [
  "active",
  "superseded",
  "retracted",
  "corrected",
]);
export const artifactKind = pgEnum("artifact_kind", [
  "protocol",
  "course",
  "claim_library_entry",
  "decision_doc",
  "marketing_material",
  "order_set",
  "configuration",
  "other",
]);
export const storagePurpose = pgEnum("storage_purpose", [
  "quarantine",
  "working_original",
  "derived_text",
  "remediation_submission",
  "report_bundle",
  "report_member",
]);
export const scanStatus = pgEnum("scan_status", [
  "pending",
  "clean",
  "rejected",
  "failed",
  "not_required_demo",
]);
export const processingStatus = pgEnum("processing_status", [
  "queued",
  "running",
  "partial",
  "failed",
  "completed",
  "unsupported",
]);
export const evidenceVerificationStatus = pgEnum(
  "evidence_verification_status",
  ["pending", "exact", "fuzzy_verified", "failed", "human_verified"],
);
export const reviewStatus = pgEnum("review_status", [
  "suggested",
  "needs_review",
  "accepted",
  "edited",
  "rejected",
]);
export const reviewTaskType = pgEnum("review_task_type", [
  "claim",
  "dependency_edge",
  "quote_verification",
  "probe_assessment",
  "artifact_remediation",
  "workflow_failure",
]);
export const reviewTaskStatus = pgEnum("review_task_status", [
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "cancelled",
]);
export const graphNodeType = pgEnum("graph_node_type", [
  "source_version",
  "artifact_version",
  "claim_version",
]);
export const dependencyEdgeType = pgEnum("dependency_edge_type", [
  "contains",
  "supported_by",
  "references",
  "depends_on",
  "informs",
]);
export const impactClass = pgEnum("impact_class", [
  "load_bearing",
  "peripheral",
  "potential_exposure",
  "unreviewed_candidate",
]);
export const changeEventStatus = pgEnum("change_event_status", [
  "draft",
  "submitted",
  "validated",
  "rejected",
  "superseded",
  "cancelled",
]);
export const caseRetirementReason = pgEnum("case_retirement_reason", [
  "ambiguous",
  "citation_invalid",
  "content_error",
  "source_superseded",
  "policy_change",
  "other",
]);
export const releaseStatus = pgEnum("release_status", [
  "draft",
  "awaiting_authorization",
  "authorized",
  "releasing",
  "released",
  "cancelled",
  "failed",
]);
export const assignmentStatus = pgEnum("assignment_status", [
  "assigned",
  "opened",
  "submitted",
  "completed",
  "expired",
  "cancelled",
]);
export const answerFormat = pgEnum("answer_format", [
  "single_choice",
  "multiple_choice",
  "free_text",
  "artifact_edit",
]);
export const assessmentLabel = pgEnum("assessment_label", [
  "old",
  "new",
  "other",
]);
export const assessmentSource = pgEnum("assessment_source", [
  "deterministic",
  "ai",
  "human",
]);
export const artifactRemediationStatus = pgEnum("artifact_remediation_status", [
  "open",
  "assigned",
  "in_progress",
  "submitted",
  "needs_review",
  "verified",
  "rejected",
  "cancelled",
]);
export const remediationStatus = pgEnum("remediation_status", [
  "assigned",
  "opened",
  "submitted",
  "needs_review",
  "passed",
  "failed",
  "cancelled",
]);
export const recheckStatus = pgEnum("recheck_status", [
  "scheduled",
  "due",
  "dispatched",
  "completed",
  "cancelled",
  "blocked_no_case",
]);
export const deliveryEventType = pgEnum("delivery_event_type", [
  "assigned",
  "provider_accepted",
  "delivered",
  "bounced",
  "opened",
  "completed",
  "failed",
]);
export const workflowStatus = pgEnum("workflow_status", [
  "queued",
  "running",
  "partial",
  "failed",
  "completed",
  "quota_paused",
  "cancelled",
]);
export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "published",
  "failed",
]);
export const integrationType = pgEnum("integration_type", [
  "workos",
  "postmark",
  "slack",
  "hris_csv",
  "lms_xapi",
  "lms_scorm",
]);
export const connectionStatus = pgEnum("connection_status", [
  "draft",
  "active",
  "error",
  "disabled",
]);
export const reportStatus = pgEnum("report_status", [
  "requested",
  "generating",
  "failed",
  "completed",
  "expired",
]);
export const retentionMode = pgEnum("retention_mode", [
  "governance",
  "compliance",
]);
export const actorType = pgEnum("actor_type", [
  "membership",
  "service_account",
  "system",
  "support_operator",
]);
