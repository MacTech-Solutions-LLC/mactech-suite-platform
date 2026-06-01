# DNS Routing and Health Endpoint Verification

## Validation Snapshot (2026-05-31)

Validated in Squarespace DNS for `mactechsolutionsllc.com` and rechecked with public DNS resolution.

### Squarespace Records Present

| Host | Squarespace/Public DNS Target | Runtime `/api/health` Result |
|------|-------------------------------|-------------------------------|
| `www.suite.mactechsolutionsllc.com` | `9vn5ypzv.up.railway.app` | `200` JSON healthy |
| `capture.mactechsolutionsllc.com` | `c1jd9dpr.up.railway.app` | `404` HTML; route exists but no public health endpoint |
| `training.mactechsolutionsllc.com` | `9zgn3om0.up.railway.app` | `200` after redirect to sign-in; health is protected |
| `quality.mactechsolutionsllc.com` | `mtanbpy1.up.railway.app` | `200` JSON `{"ok":true}` |
| `governance.mactechsolutionsllc.com` | `7x227m08.up.railway.app` | `404` HTML; route exists but no public health endpoint |
| `vault-001.mactechsolutionsllc.com` | `mactech-vault-001-e7c2apgvf3etgvhz.z02.azurefd.net` | `200` JSON EnclaveWatch healthy |
| `codex.mactechsolutionsllc.com` | `en5xfir4.up.railway.app` | `404` HTML; route exists but no public health endpoint |
| `pricing.mactechsolutionsllc.com` | `insmp6ki.up.railway.app` | `401` JSON; health is auth-gated |
| `proposal.mactechsolutionsllc.com` | `fhgcr3g1.up.railway.app` | `404` HTML; route exists but no public health endpoint |
| `range.mactechsolutionsllc.com` | `atl6f44u.up.railway.app` | `502` Railway application failed to respond |
| `cleard.mactechsolutionsllc.com` | `s5ar1zke.up.railway.app` | `200` after redirect to sign-in; health is protected |
| `opportunity.mactechsolutionsllc.com` | `n4ec647c.up.railway.app` | DNS only in this pass |
| `google.mactechsolutionsllc.com` | `t0gm33am.up.railway.app` | `200` JSON Workspace Gateway healthy |
| `design.mactechsolutionsllc.com` | `kg4n4m7y.up.railway.app` | `404` HTML; route exists but no public health endpoint |
| `vault.mactechsolutionsllc.com` | `35.202.228.125` | Connection timed out |

### Expected/Catalogued Hosts Missing From DNS

These hosts appear in Hub seed/registry or prior tracking but do not currently resolve:

| Missing Host | Notes |
|--------------|-------|
| `suite.mactechsolutionsllc.com` | Naked Suite host missing; Hub registry uses `www.suite`, which is present and healthy. |
| `qms.mactechsolutionsllc.com` | Hub seed includes canonical `qms`; Squarespace currently has legacy `quality`. |
| `workspace.mactechsolutionsllc.com` | Hub seed includes `workspace-gateway`; Squarespace currently has `google` pointing to the Workspace Gateway service. |
| `mackali.mactechsolutionsllc.com` | Missing; MacKali follow-up is deferred. |
| `cyber-range.mactechsolutionsllc.com` | Missing; Squarespace currently has `range` pointing at Cyber Range, but runtime returns 502. |
| `proposals.mactechsolutionsllc.com` | Missing; `proposal` exists and points to ProposalOS. |

### Interpretation

The 2026-05-30 assumption that most subdomains pointed to one backend is no longer supported by DNS. Squarespace has distinct Railway targets for `capture`, `training`, `quality`, `governance`, `codex`, `pricing`, `proposal`, `range`, `cleard`, `opportunity`, `google`, and `design`.

The remaining issues are:

1. Hub registry/canonical URL drift: `qms`, `workspace`, `cyber-range`, and `proposals` differ from the Squarespace records actually present.
2. Runtime/app health gaps: several apps do not expose a public `/api/health`, redirect health checks to sign-in, or return application errors.
3. Cyber Range production is DNS-configured as `range.mactechsolutionsllc.com`, not `cyber-range.mactechsolutionsllc.com`, and the configured Railway target currently returns 502.
4. `vault.mactechsolutionsllc.com` resolves to a bare A record but timed out; `vault-001.mactechsolutionsllc.com` is the healthy EnclaveWatch host.

## Current Issues (as of 2026-05-30)

### DNS/Proxy Misconfiguration

All subdomains except Codex are either unreachable or serving incorrect applications:

| Domain | Expected App | Current State | Status |
|--------|--------------|---------------|--------|
| `suite.mactechsolutionsllc.com` | MacTech Suite Hub | 502 Bad Gateway | **BROKEN** |
| `capture.mactechsolutionsllc.com` | MacTech Capture | Shows Governance login | **MISROUTED** |
| `training.mactechsolutionsllc.com` | MacTech Training | Shows Capture login | **MISROUTED** |
| `quality.mactechsolutionsllc.com` | MacTech Quality (QMS) | Shows Training login | **MISROUTED** |
| `governance.mactechsolutionsllc.com` | MacTech Governance | Shows Quality login | **MISROUTED** |
| `vault-001.mactechsolutionsllc.com` | MacTech EnclaveWatch | Shows Governance login | **MISROUTED** |
| `codex.mactechsolutionsllc.com` | MacTech Codex | Shows EnclaveWatch login | **MISROUTED** |
| (codex shows correct app when accessed directly) | Codex (CUI Vault) | Correct | **OK** |

### Root Cause

1. **Hub routing**: AppRegistry uses `https://www.suite.mactechsolutionsllc.com` but naked `suite.mactechsolutionsllc.com` returns 502
   - Missing DNS record or misconfigured load balancer
   - App Router configured for `www.suite` prefix but proxy routing to root

2. **Subdomain routing**: All subdomains resolve to the same backend
   - Indicates single ingress container/environment receiving all traffic
   - Reverse proxy not properly routing by Host header
   - OR DNS CNAME/ANAME records all point to same target

---

## Remediation Checklist

### Step 1: Verify DNS Configuration

Run these checks to confirm DNS records:

```bash
# Check each subdomain CNAME/ANAME record
nslookup suite.mactechsolutionsllc.com
nslookup www.suite.mactechsolutionsllc.com
nslookup capture.mactechsolutionsllc.com
nslookup training.mactechsolutionsllc.com
nslookup quality.mactechsolutionsllc.com
nslookup governance.mactechsolutionsllc.com
nslookup vault-001.mactechsolutionsllc.com
nslookup codex.mactechsolutionsllc.com

# Expected output: each should point to its correct Railway deployment or load balancer
```

### Step 2: Verify Ingress Configuration (Railway/Docker)

**If using Railway:**

1. Check Railway ingress configuration for each service
2. Verify that:
   - `hub` service listens on `www.suite.mactechsolutionsllc.com`
   - `capture` service listens on `capture.mactechsolutionsllc.com`
   - `training` service listens on `training.mactechsolutionsllc.com`
   - (etc. for each app)

**If using Docker Compose:**

1. Check `docker-compose.yml` reverse proxy config (e.g., Nginx, Traefik)
2. Ensure Host-based routing rules are configured:
   ```yaml
   # Example Traefik config:
   labels:
     - traefik.http.routers.hub.rule=Host(`www.suite.mactechsolutionsllc.com`)
     - traefik.http.routers.capture.rule=Host(`capture.mactechsolutionsllc.com`)
   ```

**If using a cloud load balancer (AWS ALB, GCP Load Balancer):**

1. Verify backend target group assignments
2. Confirm each domain routes to the correct service
3. Check SSL/TLS certificate covers all subdomains (wildcard or SAN)

### Step 3: Test Routing Directly

Once DNS/ingress is corrected:

```bash
# Test each app's health endpoint
curl -i https://www.suite.mactechsolutionsllc.com/api/health
curl -i https://capture.mactechsolutionsllc.com/api/health
curl -i https://training.mactechsolutionsllc.com/api/health
curl -i https://quality.mactechsolutionsllc.com/api/health
curl -i https://governance.mactechsolutionsllc.com/api/health
curl -i https://vault-001.mactechsolutionsllc.com/api/health
curl -i https://codex.mactechsolutionsllc.com/api/health
```

Expected response:
```json
{ "status": "ok" }
```

### Step 4: Update AppRegistry Health Status

Once routing is verified, the Command Center will automatically:
1. Poll each app's `/api/health` endpoint
2. Mark apps as `healthy` or `unhealthy` in the Command Center UI
3. Display app availability on `/command-center`

**Manual verification in Hub:**

```bash
# Query AppRegistry status
curl -H "Authorization: Bearer $CLERK_SESSION_TOKEN" \
  https://www.suite.mactechsolutionsllc.com/api/command-center/apps
```

Expected output includes health status for each app.

---

## Reference: Health Endpoint Standard

See `docs/COMMAND_CENTER.md` for full specification. Summary:

**Endpoint**: `GET /api/health`  
**Auth**: Public (no auth required)  
**Response**:
```json
{
  "status": "ok" | "degraded" | "offline",
  "timestamp": "2026-05-30T17:45:00Z",
  "version": "0.1.0"
}
```

**HTTP Status**: 
- 200 if healthy
- 503 if degraded/offline

---

## Implementation Checklist by App

- [ ] Hub (`www.suite.mactechsolutionsllc.com`)
  - [ ] DNS/ingress routing verified
  - [ ] `/api/health` endpoint responding 200 with `{ "status": "ok" }`
  - [ ] AppRegistry updated in Command Center
  
- [ ] Capture (`capture.mactechsolutionsllc.com`)
  - [ ] DNS/ingress routing verified
  - [ ] `/api/health` endpoint implemented (if not already)
  - [ ] AppRegistry health status updated

- [ ] Training (`training.mactechsolutionsllc.com`)
  - [ ] DNS/ingress routing verified
  - [ ] `/api/health` endpoint implemented (if not already)
  - [ ] AppRegistry health status updated

- [ ] Quality/QMS (`quality.mactechsolutionsllc.com`)
  - [ ] DNS/ingress routing verified
  - [ ] `/api/health` endpoint implemented (if not already)
  - [ ] AppRegistry health status updated

- [ ] Governance (`governance.mactechsolutionsllc.com`)
  - [ ] DNS/ingress routing verified
  - [ ] `/api/health` endpoint implemented (if not already)
  - [ ] AppRegistry health status updated

- [ ] EnclaveWatch (`vault-001.mactechsolutionsllc.com`)
  - [ ] DNS/ingress routing verified
  - [ ] `/api/health` endpoint implemented (if not already)
  - [ ] AppRegistry health status updated

- [ ] Codex (`codex.mactechsolutionsllc.com`)
  - [ ] DNS/ingress routing verified (currently partially working)
  - [ ] `/api/health` endpoint implemented (if not already)
  - [ ] AppRegistry health status updated

---

## Questions for Infrastructure Team

1. **DNS hosting**: Where are domain records managed? (Godaddy, Route53, Cloudflare, etc.)
2. **Routing layer**: Is traffic routed at DNS level (CNAME), cloud load balancer level, or container orchestration (Railway, Docker)?
3. **Current state**: Are all subdomains currently pointing to a single Railway environment or container?
4. **SSL/TLS**: Are certificates issued per subdomain or via wildcard?
5. **502 on suite.mactechsolutionsllc.com**: Is this a DNS resolution error or a backend service error?

---

## Success Criteria

✅ Each subdomain resolves to its correct backend service  
✅ Each app's `/api/health` endpoint returns 200 with `{ "status": "ok" }`  
✅ Command Center displays all apps as `healthy`  
✅ Users can sign in to the Hub and navigate between apps
