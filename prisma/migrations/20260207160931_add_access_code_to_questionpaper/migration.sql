/*
  Warnings:

  - A unique constraint covering the columns `[accessCode]` on the table `QuestionPaper` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `accessCode` to the `QuestionPaper` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "QuestionPaper" ADD COLUMN     "accessCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "QuestionPaper_accessCode_key" ON "QuestionPaper"("accessCode");
