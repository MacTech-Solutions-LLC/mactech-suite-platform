# Security-Safe Editing

Use this prompt to constrain edits that may touch security, data handling, or
automation.

```text
Make the requested change using security-safe editing rules.

Rules:
- Do not add secrets, credentials, API keys, tokens, or customer data.
- Do not print sensitive environment variables.
- Do not create deployment, publishing, or external system mutation workflows.
- Do not make production or compliance-certification claims.
- Prefer synthetic examples and placeholders.
- Keep automation read-only or local-check oriented unless explicitly approved.

Return:
- Files changed
- Security-sensitive assumptions
- Validation performed
```
