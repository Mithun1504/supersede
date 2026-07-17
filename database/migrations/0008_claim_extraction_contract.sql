-- Prompt bodies remain in source control. This immutable registry row binds runtime provenance
-- to the reviewed prompt/schema contract without granting application roles registry writes.
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
  'claim_extraction',
  'claim_extraction_v1',
  '1.0.0',
  'src/modules/ai/prompts/claim-extraction-v1.ts',
  '0000000000000000000000000000000000000000',
  '4bc333060c979f4a241777f705bebfc0f5584ce85deb10f4f5720ee25bd9f01e',
  'approved'
)
ON CONFLICT (task_type, prompt_version, schema_version) DO UPDATE
SET source_path = EXCLUDED.source_path,
    prompt_sha256 = EXCLUDED.prompt_sha256,
    status = EXCLUDED.status;
