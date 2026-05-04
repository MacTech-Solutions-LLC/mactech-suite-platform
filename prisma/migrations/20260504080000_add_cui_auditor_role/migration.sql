-- External C3PAO assessor role. Used by the /auditor-access portal to
-- gate the time-boxed IP-allowlist flow for vault-001. Distinct from the
-- internal MacTech compliance role (mactech_auditor) — cui_auditors are
-- not MacTech employees and have no admin surface beyond /auditor-access.
ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'cui_auditor';
