-- Sprint 39: page-render probe risk category.
--
-- Existing /api/health probes return 200 even when the app's actual
-- pages 500 with Next.js's "Application error · A server-side
-- exception occurred (digest: …)" page. Operators only notice when
-- a customer pings them. This adds an `application_error` risk
-- category so a per-page probe failure auto-opens a flag the same
-- way `health_down` does.

ALTER TYPE "RiskCategory" ADD VALUE IF NOT EXISTS 'application_error';
