# AI Production Readiness

Current state: implemented and tested on a feature branch. Not deployed, merged, production-ready, CUI-approved, FedRAMP-authorized, or licensed for production.

Production blockers:

- Approve the NVIDIA AI Enterprise/licensing and data-processing posture for the selected deployment.
- Choose hosted NVIDIA versus self-hosted NIM and document boundary, network, logging, and retention controls.
- Complete threat modeling, privacy review, prompt-injection testing, abuse/rate limits, and independent security review.
- Replace the deterministic corpus with an approved tenant-filtered store and controlled ingestion/revision workflow.
- Create production lifecycle persistence only after database review; conversation content remains off by default.
- Add domain service authentication suitable for server-to-server tools instead of relying on browser session forwarding.
- Implement consequential executors with expiry, immutable argument hashes, transaction-safe idempotency, reauthorization, and domain confirmation.
- Perform accessibility, load, cost, incident-response, backup/restore, and audit-retention acceptance.
- Establish the secure enclave, access controls, evidence handling, and authorization boundary before any FCI/CUI use. Hosted developer inference must continue to block those classifications.

Self-hosted NIM migration uses the same provider adapter with a different server-side base URL and credential/transport configuration. The NIM must expose compatible model discovery and chat streaming endpoints; health, TLS, egress, GPU capacity, patching, and model-license controls become deployment responsibilities.

Execution record for this slice: Hub-only feature branch; no satellite changes; no database schema migration; no production configuration, migration, secret, deployment, or live data change.
