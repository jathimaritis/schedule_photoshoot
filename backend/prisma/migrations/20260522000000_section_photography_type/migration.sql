-- AlterTable
ALTER TABLE "ShotSection" ADD COLUMN "photographyTypeId" TEXT;

-- AddForeignKey
ALTER TABLE "ShotSection" ADD CONSTRAINT "ShotSection_photographyTypeId_fkey" FOREIGN KEY ("photographyTypeId") REFERENCES "PhotographyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ShotSection_photographyTypeId_idx" ON "ShotSection"("photographyTypeId");
