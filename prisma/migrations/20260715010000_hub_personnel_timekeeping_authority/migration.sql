-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "department" TEXT,
ADD COLUMN     "employmentEndDate" TIMESTAMP(3),
ADD COLUMN     "employmentStartDate" TIMESTAMP(3),
ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "laborCategory" TEXT,
ADD COLUMN     "managerUserProfileId" TEXT,
ADD COLUMN     "standardWeekHours" DECIMAL(6,2),
ADD COLUMN     "timekeepingRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "UserProfile_managerUserProfileId_idx" ON "UserProfile"("managerUserProfileId");

-- CreateIndex
CREATE INDEX "UserProfile_department_idx" ON "UserProfile"("department");

-- CreateIndex
CREATE INDEX "UserProfile_timekeepingRequired_idx" ON "UserProfile"("timekeepingRequired");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_managerUserProfileId_fkey" FOREIGN KEY ("managerUserProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
