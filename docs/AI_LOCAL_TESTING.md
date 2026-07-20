# MacTech AI Local Testing

No NVIDIA key is required for the deterministic vertical slice.

1. Start local PostgreSQL using the repo's development database only.
2. Apply local migrations and run the idempotent seed so the `mactech-ai` AppRegistry row exists. Never point these commands at production.
3. Start Opportunity/Capture on port 3001 and ProposalOS on port 3002 with their normal Clerk/Hub development settings.
4. Start Hub with:

```powershell
$env:AI_ENABLED='true'
$env:AI_PROVIDER='mock'
$env:AI_DEVELOPMENT_MODE='true'
$env:AI_EXTERNAL_INFERENCE_ENABLED='false'
$env:OPPORTUNITIES_BASE_URL='http://localhost:3001'
$env:PROPOSAL_BASE_URL='http://localhost:3002'
npm run dev
```

5. Sign in with an active Hub user whose resolved permissions include `ai.access` and `ai.chat`; use `ai.retrieve`, `ai.tool.read`, `ai.tool.draft`, `ai.tool.execute`, `ai.approve`, or `ai.admin` only as needed.
6. Open `/admin/ai`. Verify streaming, source cards, tenant/classification badges, a read tool, a confirmed ProposalOS DRAFT, a submission approval card, and CUI blocking.

Automated validation:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

The synthetic corpus contains a public capability summary, synthetic RFQ excerpt, and synthetic QMS review procedure. It contains no customer records, FCI, CUI, or credentials.
