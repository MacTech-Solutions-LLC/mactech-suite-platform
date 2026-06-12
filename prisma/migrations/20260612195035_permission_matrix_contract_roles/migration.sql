-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContractMembershipRole" ADD VALUE 'CONTRACT_OWNER';
ALTER TYPE "ContractMembershipRole" ADD VALUE 'COR';
ALTER TYPE "ContractMembershipRole" ADD VALUE 'PM';
ALTER TYPE "ContractMembershipRole" ADD VALUE 'KEY_PERSONNEL';
ALTER TYPE "ContractMembershipRole" ADD VALUE 'SUBCONTRACTOR';
