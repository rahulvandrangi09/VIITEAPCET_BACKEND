/*
  Warnings:

  - You are about to drop the column `address` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `collegeAddress` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `collegeName` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `marks` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `medium` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `minorityStatus` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `photo` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `pincode` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `placeOfStudy` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `qualifyingExam` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `stream` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `yearOfPassing` on the `Student` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Student" DROP COLUMN "address",
DROP COLUMN "category",
DROP COLUMN "city",
DROP COLUMN "collegeAddress",
DROP COLUMN "collegeName",
DROP COLUMN "marks",
DROP COLUMN "medium",
DROP COLUMN "minorityStatus",
DROP COLUMN "photo",
DROP COLUMN "pincode",
DROP COLUMN "placeOfStudy",
DROP COLUMN "qualifyingExam",
DROP COLUMN "state",
DROP COLUMN "stream",
DROP COLUMN "yearOfPassing";
