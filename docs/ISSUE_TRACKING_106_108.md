# Issue #106 & #108 Tracking

## Issue #106 - Provision non-production DB for audit migration

### Status: VALIDATED IN PRODUCTION
The Hub Audit Ingestion v1 migration (`prisma/migrations/20260530120000_hub_audit_ingestion_v1`) has been created and includes:
- AuditLog append-only trigger enforcement (PostgreSQL function `prevent_audit_log_update_delete()`)
- SuiteObjectReference table and contract definition
- Sequence number assignment for legacy AuditLog rows
- Hash chain verification indexes

### Validation Completed
Production Railway validation was completed on 2026-05-31:

- `railway run --service mactech-suite-platform --environment production npx prisma migrate status`
- Result: 25 migrations found; database schema is up to date.
- Append-only enforcement validated in production with a no-op update attempted inside a transaction and rolled back.
- Trigger/function evidence recorded in `evidence/test-runs/2026-05-31-production-audit-trigger-validation.md`.

---

## Issue #108 - Confirm app repositories for SuiteObjectReference

### Status: VERIFICATION NEEDED
The following apps have SuiteObjectReference contracts defined but require repository confirmation:

| App Key | Repository | Status | Contact |
|---------|-----------|--------|---------|
| `mackali` | MacTech-Solutions-LLC/MacTech_Cyber_Range? | **NEEDS CONFIRMATION** | Local `C:\Users\bmacd\MacTech\MacTech-Kali` checkout points at `MacTech_Cyber_Range.git`; no separate MacKali/MacTech-Kali repo found |
| `cyber-range` | MacTech-Solutions-LLC/MacTech_Cyber_Range | **CONFIRMED** | Integration issue opened: https://github.com/MacTech-Solutions-LLC/MacTech_Cyber_Range/issues/2 |
| `training` | MacTech-Solutions-LLC/MacTech_Training | **CONFIRMED** | Integration issue opened: https://github.com/MacTech-Solutions-LLC/MacTech_Training/issues/1 |

### References
- Contracts defined in `docs/SUITE_OBJECT_REFERENCE_CONTRACT.md`
- Hub client examples in `packages/hub-client/examples/consumer-examples.ts`
- Seed app fixtures in `prisma/seed.ts`

### Action Required for Each Repository
1. **Confirm repository exists** and is accessible to MacTech-Solutions-LLC org
2. **Open GitHub issue** in each repo requesting:
   - Integration with `@mactech-solutions-llc/hub-client`
   - Implementation of SuiteObjectReference emission
   - Add `.../api/health` endpoint returning `{ status: "ok" }`
   - Emit audit events to Hub via `emitHubAuditEvent()`

3. **Sample issue template**:
   ```
   Title: Add SuiteObjectReference and Hub audit integration
   
   Body:
   - Integrate @mactech-solutions-llc/hub-client for authority resolution
   - Emit SuiteObjectReference for [object types] (see SUITE_OBJECT_REFERENCE_CONTRACT.md)
   - Implement /api/health endpoint for Command Center probe
   - Emit audit events via emitHubAuditEvent() 
   - Reference: mactech-suite-platform #108
   ```

### Object Types by App
- **mackali**: `mackali.finding`
- **cyber-range**: (TBD - confirm in repo)
- **training**: (TBD - confirm in repo)

---

## Next Steps
1. Complete Issue #106 validation (provision dev DB, run migration, test trigger)
2. Confirm repositories exist for MacKali, Cyber-Range, Training
3. Open integration issues in each downstream repo
4. Track completion in this document
