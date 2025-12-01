-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('PHYSICS', 'CHEMISTRY', 'MATHS');

-- CreateEnum
CREATE TYPE "Stream" AS ENUM ('ENGINEERING', 'PHARMACY');

-- CreateEnum
CREATE TYPE "QualifyingExam" AS ENUM ('INTERMEDIATE_REGULAR', 'INTERMEDIATE_VOCATIONAL', 'BRIDGE_COURSE');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('OC', 'BC_A', 'BC_B', 'BC_C', 'BC_D', 'BC_E', 'SC', 'ST', 'EWS');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" SERIAL NOT NULL,
    "studentId" TEXT,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL,
    "motherName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "gender" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "alternativeMobileNumber" TEXT,
    "stream" "Stream" NOT NULL,
    "qualifyingExam" "QualifyingExam" NOT NULL,
    "yearOfPassing" INTEGER NOT NULL,
    "medium" TEXT,
    "placeOfStudy" TEXT,
    "marks" TEXT,
    "collegeName" TEXT,
    "collegeAddress" TEXT,
    "category" "Category" NOT NULL,
    "minorityStatus" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "photo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "options" TEXT[],
    "correctAnswer" TEXT NOT NULL,
    "subject" "Subject" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPaper" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL DEFAULT 3,
    "totalMarks" INTEGER NOT NULL DEFAULT 160,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperQuestion" (
    "paperId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,

    CONSTRAINT "PaperQuestion_pkey" PRIMARY KEY ("paperId","questionId")
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "paperId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "answers" JSONB,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "analysisJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentId_key" ON "Student"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Result_attemptId_key" ON "Result"("attemptId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPaper" ADD CONSTRAINT "QuestionPaper_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperQuestion" ADD CONSTRAINT "PaperQuestion_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "QuestionPaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperQuestion" ADD CONSTRAINT "PaperQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "QuestionPaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
