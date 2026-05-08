# clearD Production Onboarding

This checklist onboards `clearD by MacTech Solutions` into MacTech Identity Command Center production with Clerk and Railway alignment.

## 1. App Registry Registration

`prisma/seed.ts` now includes:

- `appKey`: `cleard`
- `name`: `clearD by MacTech Solutions`
- `baseUrl`: `https://cleard.mactechsolutionsllc.com`
- `requiresOrgContext`: `true`
- `isInternalOnly`: `false`

Run:

```bash
npm run db:seed
```

Then verify in `/admin/app-registry` and `/admin/product-access`.

## 2. Clerk Production Configuration

In Clerk production:

1. Ensure organizations are enabled.
2. Configure webhooks to:
   - `https://www.suite.mactechsolutionsllc.com/api/webhooks/clerk`
3. Subscribe to:
   - `user.created`, `user.updated`, `user.deleted`
   - `organization.created`, `organization.updated`, `organization.deleted`
   - `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`
4. Copy signing secret into `CLERK_WEBHOOK_SECRET` for MacSuite prod.

## 3. clearD Launch Context Compatibility

MacSuite launches clearD via:

```text
/app-launch/cleard?orgId=<customerOrgId>
```

At launch, the redirect helper resolves entitlement and forwards the corresponding `clerkOrgId` context. clearD should consume Clerk session + org context for tenant-aware behavior.

## 4. Entitlement Enablement

For each customer org:

1. Open `/admin/customer-orgs/[orgId]/entitlements`.
2. Enable app `cleard`.
3. Set plan, seats, expiration, and any JSON configuration.
4. Confirm launch from `/welcome` card or direct `/app-launch/cleard?orgId=...`.

## 5. Production Validation

- Verify `GET /api/v1/users/{clerkUserId}/access?appKey=cleard` returns expected access rows.
- Verify `GET /api/v1/orgs/{clerkOrgId}` includes `cleard` entitlement when enabled.
- Verify audit log captures launch events and entitlement changes.
