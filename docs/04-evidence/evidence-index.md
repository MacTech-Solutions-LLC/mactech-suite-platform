# Evidence Index

This index describes the intended use of the `evidence/` folder. Evidence
records should be factual, dated, and tied to a change, review, test, or
decision.

## Folders

- `evidence/change-logs/` - future change summaries and release-adjacent notes
- `evidence/reviews/` - future review records and risk review outputs
- `evidence/test-runs/` - future test execution summaries and check results

## Evidence Rules

- Do not include secrets, credentials, tokens, API keys, or customer data.
- Prefer links to pull requests, issues, or decision records when available.
- Record what was checked, when it was checked, and the outcome.
- Avoid certification or production-readiness claims unless a future approved
  process explicitly supports them.
