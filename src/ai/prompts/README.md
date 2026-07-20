# Prompt contracts

Keep each governed AI task in a versioned module. Every change must increment
`promptVersion`, preserve strict schema validation, and pass its fixtures in
`tests/evals/`. Provider calls run in durable workflows. Domain services own
approval gates and deterministic validation.
