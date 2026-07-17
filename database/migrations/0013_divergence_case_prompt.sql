INSERT INTO ai_prompt_version (
  task_type, prompt_version, schema_version, source_path,
  git_commit_sha, prompt_sha256, status
)
VALUES (
  'divergence_case_generation',
  'divergence_case_v1',
  '1.0.0',
  'src/modules/cases/generation.ts',
  '0000000000000000000000000000000000000000',
  '31e01106e395d74d2d1b23fca5c4cb876bb6557114dccbde4c66d08eb1a0ba96',
  'approved'
)
ON CONFLICT (task_type, prompt_version, schema_version) DO NOTHING;
