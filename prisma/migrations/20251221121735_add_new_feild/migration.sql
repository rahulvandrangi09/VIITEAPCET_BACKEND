/*
  Warnings:

  - Made the column `topic` on table `Question` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Question" ALTER COLUMN "topic" SET NOT NULL;
