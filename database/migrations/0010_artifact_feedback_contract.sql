-- Immutable registry binding for schema-constrained learner correction feedback.
INSERT INTO ai_prompt_version (
  task_type,
  prompt_version,
  schema_version,
  source_path,
  git_commit_sha,
  prompt_sha256,
  status
)
VALUES (
  'artifact_feedback',
  'artifact_feedback_v1',
  '1.0.0',
  'src/modules/learning/grading.ts',
  '0000000000000000000000000000000000000000',
  'c435aa7565bb165d4a93737ce4dbacacefc8122aa85c2693c238ecd5153d4903',
  'approved'
)
ON CONFLICT (task_type, prompt_version, schema_version) DO UPDATE
SET source_path = EXCLUDED.source_path,
    prompt_sha256 = EXCLUDED.prompt_sha256,
    status = EXCLUDED.status;
