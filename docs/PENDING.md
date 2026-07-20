# Pending release work

The Displace workflow, authenticated browser journey, retrieval pipeline,
background workflows, and deterministic AI evaluation gates are implemented.
See [gap-closure verification](./qa/2026-07-18-gap-closure.md).

## Release blockers

| Gate               | Required evidence                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------- |
| GPT-5.6 extraction | `pnpm verify:live-extraction` passes with the release OpenAI credential                  |
| Gemini embedding   | `pnpm verify:live-embedding` passes with the release Gemini credential                   |
| Hosted environment | WorkOS, PostgreSQL, storage, Inngest, and readiness checks pass in the target deployment |

The verifier commands fail closed when credentials are missing. Deterministic
fixtures do not satisfy these gates.

## Deferred scope

- Automated source watchers
- Postmark and Slack delivery
- xAPI/SCORM export
- HRIS import beyond the seed
- Advanced OCR
- Enterprise SAML and MFA rollout
- Full telemetry and external uptime monitoring
- Real clinical, patient, or employee data

These are product follow-ups, not blockers for the approved hackathon slice.
