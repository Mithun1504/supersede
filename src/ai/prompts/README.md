# Prompt contracts

Store every governed AI task in its own versioned module. A prompt change must update its
`promptVersion`, retain its strict output schema, and pass the matching fixtures under
`tests/evals/` before release. Provider calls belong in durable workflow steps; domain modules
remain responsible for approval gates and deterministic validation.
