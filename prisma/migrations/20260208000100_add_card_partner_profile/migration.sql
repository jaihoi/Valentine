ALTER TABLE "CardProject"
ADD COLUMN "partnerProfileId" TEXT;

ALTER TABLE "CardProject"
ADD CONSTRAINT "CardProject_partnerProfileId_fkey"
FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "CardProject_userId_createdAt_idx"
ON "CardProject"("userId", "createdAt");

CREATE INDEX "CardProject_userId_status_createdAt_idx"
ON "CardProject"("userId", "status", "createdAt");
