-- Add Clerk-mirrored fields to CustomerOrganization.
-- maxMembers caps the org-wide member count (mirrored to Clerk's
-- maxAllowedMemberships). imageUrl is the org's logo (mirrored from
-- Clerk's imageUrl on webhook events).
ALTER TABLE "CustomerOrganization" ADD COLUMN IF NOT EXISTS "maxMembers" INTEGER;
ALTER TABLE "CustomerOrganization" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
