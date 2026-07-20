# AI Production Readiness

## Approved operating boundary

The initial production release is a hosted NVIDIA developer-inference MVP for
`PUBLIC` and approved synthetic/test `INTERNAL` content only. It is not
CUI-approved, FCI-approved, FedRAMP-authorized, or an authorization to process
customer-sensitive proposal material. The server-side classification and
secret gates remain mandatory even when the provider is healthy.

The `mactech-ai` application is registered by an idempotent Prisma migration so
Railway's existing `prisma migrate deploy` startup contract can fail closed on
Hub application authority. Production configuration remains server-side; the
NVIDIA key must never be copied into source control or browser configuration.

Expansion blockers beyond this restricted operating boundary:

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

## Production acceptance gates

For each release, record the exact merged commit, successful Railway deployment,
signed-in `/admin/ai` load, NVIDIA health, a streamed public response, cited
synthetic retrieval, a successful read-only domain tool, a confirmed ProposalOS
draft, a pending consequential approval, and a pre-provider CUI denial. A health
endpoint alone is not sufficient acceptance evidence.
