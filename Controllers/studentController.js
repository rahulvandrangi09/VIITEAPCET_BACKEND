// controllers/studentController.js
const { PrismaClient, Subject } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to sanitize questions for the student (remove correct answer field)
const sanitizeQuestion = (question) => {
    // Destructure to omit sensitive fields
    const { correctAnswer, uploadedById, createdAt, ...safeQuestion } = question; 
    
    // Ensure options are an array, even if stored as a string or if they contain non-string elements
    try {
        if (typeof safeQuestion.options === 'string') {
             // Attempt to parse JSON stringified options
            safeQuestion.options = JSON.parse(safeQuestion.options);
        } else if (!Array.isArray(safeQuestion.options)) {
            // Default to empty array if unexpected type
            safeQuestion.options = [];
        }
    } catch (e) {
        console.error("Error parsing question options:", e);
        safeQuestion.options = [];
    }
    
    return safeQuestion;
};

// --- Student Function: Get list of available exams ---
const getAvailableExams = async (req, res) => {
    // Mock studentId for now, replace with authenticated user later
    // const studentId = req.query.studentId || 1; 
    
    try {
        // Fetch only papers explicitly marked as active
        const availablePapers = await prisma.questionPaper.findMany({
            where: { isActive: true },
            select: { 
                id: true, 
                title: true, 
                durationHours: true, 
                totalMarks: true,
                createdAt: true,
            }
        });

        res.status(200).json({
            message: 'Available exams fetched successfully.',
            exams: availablePapers,
        });

    } catch (error) {
        console.error('Get Available Exams Error:', error);
        res.status(500).json({ message: 'Internal server error while fetching exams.' });
    }
};


// --- Student Function: Start an exam and retrieve questions ---
const startExam = async (req, res) => {
    // IMPORTANT: In production, studentId must come from an authentication token, not the body.
    const { studentId, paperId } = req.body; 

    if (!studentId || !paperId) {
        return res.status(400).json({ message: 'Student ID and Paper ID are required.' });
    }

    try {
        const parsedPaperId = parseInt(paperId);
        const parsedStudentId = parseInt(studentId);

        const paper = await prisma.questionPaper.findUnique({
            where: { id: parsedPaperId },
            include: {
                paperQuestions: {
                    select: { questionId: true }
                }
            }
        });

        if (!paper) {
            return res.status(404).json({ message: 'Question paper not found.' });
        }
        
        // 1. Check if the student already has an ongoing attempt for this paper
        let attempt = await prisma.examAttempt.findFirst({
            where: { 
                studentId: parsedStudentId, 
                paperId: parsedPaperId, 
                isCompleted: false 
            }
        });

        let isResuming = !!attempt;
        
        if (!attempt) {
            // 2. Create a new exam attempt if none exists
            attempt = await prisma.examAttempt.create({
                data: {
                    studentId: parsedStudentId,
                    paperId: parsedPaperId,
                    startTime: new Date(),
                    isCompleted: false,
                }
            });
        }
        
        // 3. Fetch all question details
        const questionIds = paper.paperQuestions.map(pq => pq.questionId);
        const questions = await prisma.question.findMany({
            where: { id: { in: questionIds } },
            orderBy: { id: 'asc' } 
        });

        // 4. Sanitize and structure questions for the student
        const sanitizedQuestions = questions.map(q => sanitizeQuestion(q));
        
        // Calculate initial remaining time (3 hours from start time)
        const durationInMilliseconds = paper.durationHours * 3600 * 1000;
        const endTime = new Date(attempt.startTime.getTime() + durationInMilliseconds);
        const timeRemaining = Math.max(0, Math.floor((endTime.getTime() - new Date().getTime()) / 1000));


        res.status(200).json({
            message: isResuming ? 'Exam resumed successfully.' : 'Exam started successfully.',
            attemptId: attempt.id,
            paperTitle: paper.title,
            durationHours: paper.durationHours,
            questions: sanitizedQuestions,
            startTime: attempt.startTime,
            timeRemainingSeconds: timeRemaining,
            savedAnswers: attempt.answers, // Send any previously saved answers (if resuming)
        });

    } catch (error) {
        console.error('Start Exam Error:', error);
        res.status(500).json({ message: 'Internal server error while starting exam.' });
    }
};


// --- Student Function: Submit attempt and mark as complete ---
const submitAttempt = async (req, res) => {
    const { attemptId, answers } = req.body; // Answers structure: { questionId: 'answer text', ... }

    if (!attemptId || !answers || typeof answers !== 'object') {
        return res.status(400).json({ message: 'Attempt ID and answers object are required.' });
    }

    try {
        // 1. Check if the attempt exists and is not completed
        const attempt = await prisma.examAttempt.findUnique({
            where: { id: parseInt(attemptId) }
        });

        if (!attempt) {
            return res.status(404).json({ message: 'Exam attempt not found.' });
        }
        if (attempt.isCompleted) {
             return res.status(400).json({ message: 'Exam already completed.' });
        }

        // 2. Store answers, set end time, and mark as completed
        const updatedAttempt = await prisma.examAttempt.update({
            where: { id: parseInt(attemptId) },
            data: {
                // Prisma handles converting the JS object to JSON type in Postgres
                answers: answers, 
                endTime: new Date(),
                isCompleted: true,
            }
        });

        // NOTE: Scoring and result generation is triggered by the Admin, not here.

        res.status(200).json({
            message: 'Exam submitted successfully. Results will be announced soon.',
            attemptId: updatedAttempt.id,
            endTime: updatedAttempt.endTime,
        });

    } catch (error) {
        console.error('Submit Attempt Error:', error);
        res.status(500).json({ message: 'Internal server error during submission.' });
    }
};


module.exports = {
    getAvailableExams,
    startExam,
    submitAttempt
};