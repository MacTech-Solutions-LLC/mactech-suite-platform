-- Internal-operator flag for MacTech Solutions and any future internal-only
-- orgs. Customers always have isInternalMacTech=false; internal users still
-- bypass entitlement checks via UserProfile.isInternalMacTechUser.
ALTER TABLE "CustomerOrganization"
  ADD COLUMN IF NOT EXISTS "isInternalMacTech" BOOLEAN NOT NULL DEFAULT false;
