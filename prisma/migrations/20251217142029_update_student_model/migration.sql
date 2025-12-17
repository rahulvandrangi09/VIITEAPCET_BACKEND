/*
  Warnings:

  - The values [MATHS] on the enum `Subject` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Subject_new" AS ENUM ('PHYSICS', 'CHEMISTRY', 'MATHEMATICS');
ALTER TABLE "Question" ALTER COLUMN "subject" TYPE "Subject_new" USING ("subject"::text::"Subject_new");
ALTER TYPE "Subject" RENAME TO "Subject_old";
ALTER TYPE "Subject_new" RENAME TO "Subject";
DROP TYPE "Subject_old";
COMMIT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "isAttemptingExam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSafe" BOOLEAN NOT NULL DEFAULT false;
