-- AlterTable
ALTER TABLE "ShotLocation" ADD COLUMN "photographyTypeId" TEXT;

-- AddForeignKey
ALTER TABLE "ShotLocation" ADD CONSTRAINT "ShotLocation_photographyTypeId_fkey" FOREIGN KEY ("photographyTypeId") REFERENCES "PhotographyType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ShotLocation_photographyTypeId_idx" ON "ShotLocation"("photographyTypeId");
