# Review Current Changes

Use this prompt to review local changes before commit or pull request.

```text
Inspect the current git diff and review it for correctness, scope control,
security-safe editing, missing documentation, and missing validation.

Rules:
- Do not commit.
- Do not push.
- Do not delete files.
- Do not add secrets, credentials, tokens, API keys, or customer data.
- Do not make production, CMMC, FedRAMP, ISO, or certification claims.

Return:
- Findings ordered by severity with file references
- Validation performed
- Recommended next actions
```
