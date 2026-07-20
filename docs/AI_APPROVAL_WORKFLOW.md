# AI Approval Workflow

Consequential AI actions reuse Hub's established `AgentRun` and `AgentStep` approval ledger. The AI creates an `awaiting_approval` run with a redacted preview, required `ai.approve` permission, expiry metadata, idempotency key, source app scope, and invariants requiring human approval and authority revalidation.

The requester cannot approve their own AgentRun under the existing AgentOps separation-of-duties rule. Duplicate pending/executed requests with the same idempotency key return the existing request. Argument changes produce a different request and invalidate the earlier preview's relevance.

For this MVP, approval does not enable proposal submission. The staged capability key is intentionally outside the executable registry. A later production slice must add a domain-confirmed executor that re-resolves Hub authority, checks expiry and unchanged argument hash, claims idempotency, calls ProposalOS, records the confirmation, and audits every transition.

Statuses shown through AgentOps are `awaiting_approval`, `approved`, `rejected`, `running`, `completed`, `failed`, and `cancelled`. AI never approves its own work.
