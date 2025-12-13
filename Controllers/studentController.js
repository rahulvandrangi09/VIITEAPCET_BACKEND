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
    
    try {
        // Fetch only papers explicitly marked as active (isActive: true)
        const availablePapers = await prisma.questionPaper.findMany({
            where: { isActive: true }, // 👈 Crucial filter!
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

    // Debug: log arrival of submit call
    try {
        console.log('submitAttempt - received request', { attemptId: attemptId, answersType: typeof answers, answersKeys: answers ? Object.keys(answers).slice(0,20) : [] });
    } catch (e) {
        console.warn('submitAttempt debug log failed', e);
    }

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

        // 3. Calculate score immediately: fetch paper questions and correct answers
        const attemptWithPaper = await prisma.examAttempt.findUnique({
            where: { id: parseInt(attemptId) },
            include: {
                paper: {
                    include: { paperQuestions: true }
                }
            }
        });

        // Collect question IDs
        const questionIds = attemptWithPaper.paper.paperQuestions.map(pq => pq.questionId);

        let questions = await prisma.question.findMany({
            where: { id: { in: questionIds } }
        });

        // Ensure `options` is an array for each question (DB may store JSON as string)
        questions = questions.map(q => {
            try {
                if (typeof q.options === 'string') {
                    return { ...q, options: JSON.parse(q.options) };
                }
            } catch (e) {
                console.warn('Failed to parse options for question', q.id, e);
            }
            return q;
        });

        // Tally correct answers and per-subject scores
        let totalCorrect = 0;
        const subjectTotals = {};
        const subjectCorrect = {};

        for (const q of questions) {
            const qId = q.id.toString();
            // Normalize stored answer from client
            const given = answers?.[qId];

            // Determine correctness robustly
            let isCorrect = false;

            try {
                // If correctAnswer stores index (e.g., '0' or '1') compare to given
                if (String(q.correctAnswer) === String(given)) {
                    isCorrect = true;
                } else {
                    // If options array exists, compare selected option value to correctAnswer
                    if (Array.isArray(q.options) && given !== undefined) {
                        const selectedValue = q.options[Number(given)];
                        if (String(selectedValue) === String(q.correctAnswer)) {
                            isCorrect = true;
                        }
                    }
                }
            } catch (e) {
                // Ignore per-question parse errors
                console.error('Answer parse error for question', q.id, e);
            }

            totalCorrect += isCorrect ? 1 : 0;

            // Subject tallies - normalize subject key to uppercase for consistent analysis keys
            const rawSubj = q.subject || 'GENERAL';
            const subj = String(rawSubj).toUpperCase();
            subjectTotals[subj] = (subjectTotals[subj] || 0) + 1;
            subjectCorrect[subj] = (subjectCorrect[subj] || 0) + (isCorrect ? 1 : 0);
        }

        // 4. Update attempt score
        await prisma.examAttempt.update({
            where: { id: parseInt(attemptId) },
            data: { score: totalCorrect }
        });

        // 5. Create Result record with analysis
        const analysis = {};
        for (const subj of Object.keys(subjectTotals)) {
            analysis[subj] = {
                score: subjectCorrect[subj] || 0,
                total: subjectTotals[subj] || 0
            };
        }

        // Debugging: log subjects and computed tallies to help trace missing scores
        try {
            console.log('SubmitAttempt Debug - question subjects and ids:', questions.map(q => ({ id: q.id, subject: q.subject })));
            console.log('SubmitAttempt Debug - subjectTotals:', subjectTotals);
            console.log('SubmitAttempt Debug - subjectCorrect:', subjectCorrect);
            console.log('SubmitAttempt Debug - analysis being saved:', analysis);
        } catch (logErr) {
            console.warn('Failed to log submitAttempt debug info', logErr);
        }

        const result = await prisma.result.create({
            data: {
                attemptId: parseInt(attemptId),
                totalScore: totalCorrect,
                analysisJson: analysis
            }
        });

        res.status(200).json({
            message: 'Exam submitted and scored successfully.',
            attemptId: updatedAttempt.id,
            endTime: updatedAttempt.endTime,
            totalScore: totalCorrect,
            resultId: result.id,
        });

    } catch (error) {
        console.error('Submit Attempt Error:', error);
        res.status(500).json({ message: 'Internal server error during submission.' });
    }
};

const getAttemptResult = async (req, res) => {
    // ⚠️ IMPORTANT: In a real app, studentId should come from req.user.id (auth token).
    // For now, we take it from query params.
    const { studentId, paperId } = req.query; 

    if (!studentId || !paperId) {
        return res.status(400).json({ message: "Student ID and Paper ID are required." });
    }

    try {
        const result = await prisma.result.findFirst({
            where: {
                examAttempt: {
                    studentId: parseInt(studentId),
                    paperId: parseInt(paperId),
                    isCompleted: true, // Only show completed exams
                }
            },
            // Include necessary relations to get paper details
            include: {
                examAttempt: {
                    include: { 
                        paper: true,
                        student: true 
                    }
                }
            }
        });

        if (!result) {
            return res.status(404).json({ message: "No completed result found for this exam." });
        }

        const analysis = result.analysisJson || {};

        // Calculate time taken (endTime - startTime) if available
        let timeTaken = 'N/A';
        const startTime = result.examAttempt.startTime;
        const endTime = result.examAttempt.endTime || result.createdAt;
        if (startTime && endTime) {
            const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            timeTaken = `${diffHours}h ${diffMinutes}m`;
        }

        // Calculate accuracy as percentage of total marks
        const totalMarks = result.examAttempt.paper.totalMarks || 1;
        const accuracy = totalMarks > 0 ? `${((result.totalScore / totalMarks) * 100).toFixed(1)}%` : 'N/A';

        // Map the backend data to the exact structure the frontend expects
        return res.status(200).json({
            examName: result.examAttempt.paper.title,
            date: result.createdAt.toISOString().split('T')[0], // Format date simply
            totalMarks: totalMarks,
            score: result.totalScore,
            timeTaken: timeTaken,
            accuracy: accuracy,
            rank: 'N/A',     // Requires competition data
            percentile: 'N/A', // Requires competition data

            // Extract subject scores from the JSON analysis field (case-insensitive keys)
            mathsScore: (analysis.MATHS?.score) || (analysis.maths?.score) || (analysis.Maths?.score) || 0,
            physicsScore: (analysis.PHYSICS?.score) || (analysis.physics?.score) || (analysis.Physics?.score) || 0,
            chemistryScore: (analysis.CHEMISTRY?.score) || (analysis.chemistry?.score) || (analysis.Chemistry?.score) || 0,
            insights: ["Review topics with lower scores.", "Focus on time management."],
        });

    } catch (error) {
        console.error('Get Result Error:', error);
        return res.status(500).json({ message: 'Internal server error while fetching result.' });
    }
};

/**
 * Helper function to map result data structure from the database
 * to the exact structure the Results.jsx frontend component expects.
 */
const mapResultData = (result) => {
    // analysisJson is stored as a JSON object by Prisma
    const analysis = result.analysisJson || {};
    const totalMarks = result.examAttempt.paper.totalMarks;
    const startTime = result.examAttempt.startTime;
    const endTime = result.examAttempt.endTime;
    
    // Compute time taken and accuracy
    let timeTaken = "N/A";
    if (startTime && endTime) {
        const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        timeTaken = `${diffHours}h ${diffMinutes}m`;
    }

    const accuracy = totalMarks > 0 ? `${((result.totalScore / totalMarks) * 100).toFixed(1)}%` : 'N/A';

    const getScore = (analysisObj, key) => {
        if (!analysisObj) return 0;
        const found = Object.keys(analysisObj).find(k => String(k).toUpperCase() === String(key).toUpperCase());
        return found && analysisObj[found] && typeof analysisObj[found].score === 'number' ? analysisObj[found].score : (analysisObj[key]?.score || 0);
    };

    return {
        // Use the Result ID as the unique key for the accordion/main display
        id: result.id, 
        paperId: result.examAttempt.paper.id,
        examName: result.examAttempt.paper.title,
        date: result.createdAt.toISOString().split('T')[0],
        totalMarks: totalMarks,
        score: result.totalScore, // Send the raw score for processing
        
        // dynamic calculated fields:
        timeTaken: timeTaken,
        accuracy: accuracy, 
        rank: "N/A",
        percentile: "N/A",
        
        // Extract subject scores from the JSON analysis field (case-insensitive)
        mathsScore: getScore(analysis, 'MATHS'),
        physicsScore: getScore(analysis, 'PHYSICS'),
        chemistryScore: getScore(analysis, 'CHEMISTRY'),
        insights: ["Review topics with lower scores.", "Focus on time management."],
    };
};

/**
 * Fetches all completed exam results and associated analysis for a specific student.
 */
const getStudentResultsHistory = async (req, res) => {
    // Get studentId from query parameters (as implemented in the frontend fetch)
    const { studentId } = req.query; 

    if (!studentId) {
        return res.status(400).json({ message: "Student ID is required." });
    }

    try {
        // Fetch all Result records where the linked ExamAttempt is completed by the student
        const results = await prisma.result.findMany({
            where: {
                examAttempt: {
                    studentId: parseInt(studentId),
                    isCompleted: true,
                }
            },
            // Order by most recent completion date first
            orderBy: { createdAt: 'desc' },
            // Include necessary relations to map the data
            include: {
                examAttempt: {
                    include: { 
                        paper: true,
                    }
                }
            }
        });

        // Map the raw Prisma objects into the standardized frontend structure
        const history = results.map(mapResultData);

        return res.status(200).json({
            message: "Student results history fetched successfully.",
            history: history,
        });

    } catch (error) {
        console.error('Get History Error:', error);
        // Return 500 error if database operation fails unexpectedly
        return res.status(500).json({ message: 'Internal server error while fetching results history.' });
    }
};


module.exports = {
    getAvailableExams,
    startExam,
    submitAttempt,
    getAttemptResult,
    getStudentResultsHistory
};