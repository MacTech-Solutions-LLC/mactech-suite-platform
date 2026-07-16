-- ADR-0003: suite-wide member capability profile.
--
-- Additive only: two new tables and two new enum values. Nothing existing is
-- altered or dropped, so this is safe to deploy ahead of any writer.
--
-- Hand-written rather than taken verbatim from `prisma migrate diff`. That diff
-- also emits two statements against AuditLog:
--
--   ALTER TABLE "AuditLog" ALTER COLUMN "sequenceNumber" DROP DEFAULT;
--   DROP SEQUENCE "AuditLog_sequenceNumber_seq";
--
-- which are pre-existing drift between schema.prisma and the migration history
-- on main — not part of this change, and destructive to an append-only audit
-- log. They are deliberately excluded. See the PR for the drift report; it
-- needs its own fix, and whoever next runs `migrate dev` here will hit it too.

-- AlterEnum
-- One ADD VALUE per statement. Postgres allows this inside a transaction so
-- long as the new value is not used in the same transaction; nothing here does.
ALTER TYPE "ApiKeyScope" ADD VALUE 'profile_read';
ALTER TYPE "ApiKeyScope" ADD VALUE 'profile_write';

-- CreateTable
CREATE TABLE "MemberCapabilityProfile" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "laborCategory" TEXT,
    "yearsExperience" INTEGER,
    "sourceAppKey" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberCapabilityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberCapabilityNaics" (
    "profileId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "MemberCapabilityNaics_pkey" PRIMARY KEY ("profileId","code")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberCapabilityProfile_userProfileId_key" ON "MemberCapabilityProfile"("userProfileId");

-- CreateIndex
CREATE INDEX "MemberCapabilityProfile_sourceAppKey_idx" ON "MemberCapabilityProfile"("sourceAppKey");

-- CreateIndex
CREATE INDEX "MemberCapabilityNaics_code_idx" ON "MemberCapabilityNaics"("code");

-- AddForeignKey
ALTER TABLE "MemberCapabilityProfile" ADD CONSTRAINT "MemberCapabilityProfile_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCapabilityNaics" ADD CONSTRAINT "MemberCapabilityNaics_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MemberCapabilityProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
