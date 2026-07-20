# AI Tool Registry

The code-defined registry is the only tool authority. The model cannot call arbitrary URLs, SQL, shell commands, or functions. Every definition names its source app, entitlement, permission, classification allowance, risk, approval policy, timeout, and audit event.

Implemented tools:

| Tool | Authority | Risk | Behavior |
|---|---|---|---|
| `suite.search_opportunities` | Opportunity/Capture | READ_ONLY | Calls the authenticated search API |
| `suite.read_opportunity` | Opportunity/Capture | READ_ONLY | Calls the authenticated record API |
| `suite.create_proposal_pursuit_draft` | ProposalOS | DRAFT_CREATE | Creates a real `DRAFT` pursuit and requires a domain-confirmed ID |
| `suite.submit_proposal` | ProposalOS | CONSEQUENTIAL_WRITE | Creates a human approval request; execution is disabled |

Domain calls forward the current authenticated session, set a request ID, enforce strict Zod schemas, recheck the source-app entitlement, time out, and require a successful domain response. Development-status app registry rows are usable only under `NODE_ENV=development` plus explicit `AI_DEVELOPMENT_MODE=true`.

To add a tool safely: define a strict input schema, select the narrowest permission, identify the domain authority, choose the risk level, implement only the domain API adapter, add tenant/permission/classification tests, and emit the appropriate audit event. Consequential tools must stage an approval and remain non-executable until an independently reviewed executor exists.
