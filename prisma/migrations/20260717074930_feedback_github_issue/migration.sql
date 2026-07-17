-- NOTE: `prisma migrate dev` again proposed dropping the AuditLog
-- sequenceNumber sequence + default here (the same pre-existing schema↔DB
-- divergence from d1c5f70, deferred by the team). Deliberately omitted —
-- this migration only adds the Feedback GitHub-issue columns.

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "githubIssueNumber" INTEGER,
ADD COLUMN     "githubIssueUrl" TEXT,
ADD COLUMN     "githubRepo" TEXT;
