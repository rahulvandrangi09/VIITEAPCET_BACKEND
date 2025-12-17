// controllers/adminController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { sendMail, createResultMail, createRegistrationMail } = require('../utils/mail');
const { Subject, Difficulty } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { hashPassword, comparePassword } = require('./authController');
const LATE_START_WINDOW_MS = 15 * 60 * 1000;


// --- Helper for Random Selection ---
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// ⚠️ IMPORTANT: Set a default ID for the uploader for the foreign key constraint.
// You must ensure a User with this ID exists (Teacher or Admin role).
const DEFAULT_UPLOADER_ID = 1;

const getFilePath = (imageKey, uploadedFiles) => {
    if (!imageKey) return null;
    const file = uploadedFiles.find(f => f.fieldname === imageKey);
    // Returns a path like: /uploads/1700000000000-image.png
    return file ? path.join('/uploads', file.filename) : null; 
};

const generateCustomQuestionPaper = async (req, res) => {
    // 🚨 ADD startTime to destructuring
    const { adminId, title, distribution, durationHours, startTime } = req.body; 
    console.log(req.body);
    // 🚨 Update validation to include startTime
    if (!adminId || !title || !distribution || !startTime) {
        return res.status(400).json({ message: 'Admin ID, title, distribution, and start time are required.' });
    }

    let allSelectedQuestions = [];
    let totalQuestionsCount = 0;

    try {
        const subjectKeys = Object.keys(distribution).filter(k => Subject[k]);
        console.log(Subject["CHEMISTRY"]);
        console.log(Subject["PHYSICS"]);
        console.log(Subject["MATHEMATICS"]);
        console.log(Object.keys(distribution));
        for (const subjectKey of subjectKeys) {
            // ... (Existing question selection logic remains the same) ...
            const subject = Subject[subjectKey];
            const subjectDistribution = distribution[subjectKey];
            let selectedSubjectQuestions = [];
            
            for (const difficultyKey in subjectDistribution) {
                const difficulty = Difficulty[difficultyKey];
                const targetCount = parseInt(subjectDistribution[difficultyKey]);
                
                if (targetCount <= 0 || !difficulty) continue;

                const availableQuestions = await prisma.question.findMany({
                    where: { subject: subject, difficulty: difficulty },
                    select: { id: true }
                });

                const questionsToTake = Math.min(targetCount, availableQuestions.length);
                const randomSelection = shuffleArray(availableQuestions).slice(0, questionsToTake);
                
                selectedSubjectQuestions = selectedSubjectQuestions.concat(randomSelection);
                totalQuestionsCount += randomSelection.length;
            }

            shuffleArray(selectedSubjectQuestions);
            allSelectedQuestions = allSelectedQuestions.concat(selectedSubjectQuestions);
        }

        if (allSelectedQuestions.length === 0) {
             return res.status(404).json({ message: 'Could not find any questions based on the selected distribution.' });
        }
        
        shuffleArray(allSelectedQuestions);

        const newPaper = await prisma.questionPaper.create({
            data: {
                title: title,
                createdById: parseInt(adminId),
                durationHours: parseInt(durationHours) || 3,
                startTime: new Date(startTime),
                totalMarks: totalQuestionsCount,
                paperQuestions: {
                    create: allSelectedQuestions.map(q => ({
                        questionId: q.id
                    }))
                }
            },
            include: {
                paperQuestions: true 
            }
        });

        res.status(201).json({
            message: 'Question Paper created successfully.',
            paperId: newPaper.id,
            totalQuestions: newPaper.paperQuestions.length,
        });

    } catch (error) {
        console.error('Custom Paper Generation Error:', error);
        res.status(500).json({ message: 'Internal server error during custom paper generation.' });
    }
};

const previewQuestionPaper = async (req, res) => {
    const { paperId } = req.params;
    
    try {
        const paper = await prisma.questionPaper.findUnique({
            where: { id: parseInt(paperId) },
            include: {
                paperQuestions: {
                    include: {
                        question: true 
                    }
                }
            }
        });

        if (!paper) {
            return res.status(404).json({ message: 'Question paper not found.' });
        }

        const questions = paper.paperQuestions
            .map(pq => ({
                id: pq.question.id,
                text: pq.question.text,
                options: pq.question.options, 
                correctAnswer: pq.question.correctAnswer,
                subject: pq.question.subject,
                difficulty: pq.question.difficulty,
            }))
            .sort((a, b) => a.id - b.id); 

        res.status(200).json({
            title: paper.title,
            questions: questions,
        });

    } catch (error) {
        console.error('Preview Paper Error:', error);
        res.status(500).json({ message: 'Internal server error during paper preview.' });
    }
};

const saveQuestionsToDb = async (req, res) => {
    if (!req.body.questions) {
        if (req.files) {
             req.files.forEach(file => fs.unlinkSync(file.path));
        }
        return res.status(400).json({ message: "No questions payload found in request body. Upload failed." });
    }
    let uploadedFiles = req.files || [];
    let questionsToSave = [];

    try {
        const questionsPayload = JSON.parse(req.body.questions);
        
        for (const q of questionsPayload) {
            const subject = q.subject; 
            const difficulty = q.difficulty;
            const optionsArray = [q.optionA, q.optionB, q.optionC, q.optionD];
            questionsToSave.push({
                text: q.question, 
                options: optionsArray, 
                correctAnswer: q.answer, // e.g., "Option A"
                uploadedById: DEFAULT_UPLOADER_ID, 
                subject: subject,
                difficulty: difficulty,
                questionImageUrl: getFilePath(q.questionImageKey, uploadedFiles),
                optionAImageUrl: getFilePath(q.optionAImageKey, uploadedFiles),
                optionBImageUrl: getFilePath(q.optionBImageKey, uploadedFiles),
                optionCImageUrl: getFilePath(q.optionCImageKey, uploadedFiles),
                optionDImageUrl: getFilePath(q.optionDImageKey, uploadedFiles),
            });
        }

        if (questionsToSave.length === 0) {
            // Clean up files if no valid questions were parsed
            if (uploadedFiles.length > 0) {
                 uploadedFiles.forEach(file => fs.unlinkSync(file.path));
            }
            return res.status(400).json({ message: "No valid questions were processed to save." });
        }
        // 2. Save to Database using Prisma
        const result = await prisma.question.createMany({
            data: questionsToSave,
            skipDuplicates: true,
        });

        res.status(200).json({
            message: `✅ Successfully saved ${result.count} questions to the database.`,
            count: result.count
        });

    } catch (error) {
        console.error("❌ Database save failed:", error);
        if (uploadedFiles.length > 0) {
            uploadedFiles.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                } catch (cleanupError) {
                    console.error(`Failed to delete file ${file.path} after DB error:`, cleanupError);
                }
            });
        }

        return res.status(500).json({ message: "Internal server error during question save.", error: error.message });
    }
};


// --- CORE ADMIN FUNCTION: Generate a balanced question paper ---
const generateQuestionPaper = async (req, res) => {
    const { adminId, title, startTime } = req.body;
    
    // 🚨 Update validation to include startTime
    if (!adminId || !title || !startTime) {
        return res.status(400).json({ message: 'Admin ID, title, and start time are required.' });
    }
    const DEFAULT_DISTRIBUTION = {
        EASY: 0.30, 
        MEDIUM: 0.40, 
        HARD: 0.30
    };

    const TARGET_QUESTIONS = {
        PHYSICS: 40,
        CHEMISTRY: 40,
        MATHS: 80
    };

    let allSelectedQuestions = [];

    try {
        for (const subjectKey of Object.keys(TARGET_QUESTIONS)) {
            const subject = Subject[subjectKey];
            const targetCount = TARGET_QUESTIONS[subjectKey];
            let selectedSubjectQuestions = [];
            
            // Iterate over difficulty levels
            const difficulties = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD];
            
            for (let i = 0; i < difficulties.length; i++) {
                const diffKey = difficulties[i];
                
                let diffTargetCount = Math.round(targetCount * DEFAULT_DISTRIBUTION[diffKey]);
                
                // Adjustment for the last difficulty (HARD) to ensure total count is met
                if (i === difficulties.length - 1) {
                    diffTargetCount = targetCount - selectedSubjectQuestions.length;
                }
                
                if (diffTargetCount <= 0) continue;

                const availableQuestions = await prisma.question.findMany({
                    where: { subject: subject, difficulty: diffKey },
                    select: { id: true }
                });

                if (availableQuestions.length < diffTargetCount) {
                    selectedSubjectQuestions = selectedSubjectQuestions.concat(availableQuestions);
                } else {
                    const randomSelection = shuffleArray(availableQuestions).slice(0, diffTargetCount);
                    selectedSubjectQuestions = selectedSubjectQuestions.concat(randomSelection);
                }
            }

            shuffleArray(selectedSubjectQuestions);
            allSelectedQuestions = allSelectedQuestions.concat(selectedSubjectQuestions);
        }

        if (allSelectedQuestions.length === 0) {
             return res.status(404).json({ message: 'Could not find any questions to create the paper.' });
        }

        const newPaper = await prisma.questionPaper.create({
            data: {
                title: title,
                createdById: parseInt(adminId),
                durationHours: 3,
                startTime: new Date(startTime),
                totalMarks: 160,
                paperQuestions: {
                    create: allSelectedQuestions.map(q => ({
                        questionId: q.id
                    }))
                }
            },
            include: {
                paperQuestions: {
                    select: { questionId: true }
                }
            }
        });

        res.status(201).json({
            message: 'Question Paper created successfully.',
            paperId: newPaper.id,
            totalQuestions: newPaper.paperQuestions.length,
        });

    } catch (error) {
        console.error('Paper Generation Error:', error);
        res.status(500).json({ message: 'Internal server error during paper generation.' });
    }
};

const answerMap = {
    'Option A': 0,
    'Option B': 1,
    'Option C': 2,
    'Option D': 3,
};

// --- CORE ADMIN FUNCTION: Send Mass Results Mails (Updated Scoring Logic) ---
const sendResultsMails = async (req, res) => {
    const { paperId } = req.body;
    
    if (!paperId) {
        return res.status(400).json({ message: 'Paper ID is required to send results.' });
    }

    try {
        // 1. Fetch the Paper and ALL its Questions with correct answers
        const paperDetails = await prisma.questionPaper.findUnique({
            where: { id: parseInt(paperId) },
            include: {
                paperQuestions: {
                    include: {
                        question: {
                            select: { id: true, correctAnswer: true, subject: true }
                        }
                    }
                }
            }
        });

        if (!paperDetails) {
            return res.status(404).json({ message: 'Question paper not found.' });
        }
        
        // Map questions to a dictionary for quick lookup: { questionId: { answerIndex, subject } }
        const correctAnswersMap = paperDetails.paperQuestions.reduce((acc, pq) => {
            const q = pq.question;
            acc[q.id] = {
                correctIndex: answerMap[q.correctAnswer] !== undefined ? answerMap[q.correctAnswer] : null,
                subject: q.subject,
            };
            return acc;
        }, {});
        

        const completedAttempts = await prisma.examAttempt.findMany({
            where: { paperId: parseInt(paperId), isCompleted: true },
            include: { student: true, paper: true, result: true }
        });

        if (completedAttempts.length === 0) {
            return res.status(404).json({ message: 'No completed attempts found for this paper.' });
        }

        let emailsSent = 0;
        let resultsCreated = 0;
        const allScores = [];

        for (const attempt of completedAttempts) {
            const studentAnswers = attempt.answers || {}; 
            let totalScore = 0;
            let analysis = { PHYSICS: { score: 0, total: 40, weakAreas: [] }, CHEMISTRY: { score: 0, total: 40, weakAreas: [] }, MATHS: { score: 0, total: 80, weakAreas: [] } }; // Initialize analysis

            // 2. Score the attempt
            for (const qId in studentAnswers) {
                const questionData = correctAnswersMap[parseInt(qId)];
                if (!questionData) continue; 
                const studentSelectionIndex = studentAnswers[qId];
                const subject = questionData.subject;
                const correctIndex = questionData.correctIndex;
                
                if (studentSelectionIndex === correctIndex) {
                    totalScore += 1; // Assuming 1 mark per correct answer
                    // Update subject score (assuming subject keys match analysis keys)
                    if (analysis[subject]) {
                        analysis[subject].score += 1;
                    }
                }
                // NOTE: Negative marking, attempt count, and accuracy calculation would go here.
            }
            
            // 3. Update ExamAttempt and Create/Update Result
            const updatedAttempt = await prisma.examAttempt.update({
                where: { id: attempt.id },
                data: { score: totalScore }
            });

            // Re-use or create the Result record
            if (attempt.result) {
                await prisma.result.update({
                    where: { id: attempt.result.id },
                    data: { totalScore: totalScore, analysisJson: analysis },
                });
            } else {
                await prisma.result.create({
                    data: {
                        attemptId: attempt.id,
                        totalScore: totalScore,
                        analysisJson: analysis,
                    }
                });
                resultsCreated++;
            }
            
            allScores.push({ fullName: attempt.student.fullName, score: totalScore });

            // 4. Send email (existing logic)
            // const emailContent = createResultMail(attempt.student.fullName, totalScore, paperDetails.totalMarks, analysis);
            // await sendMail(attempt.student.email, `Your Mock Exam Results: ${paperDetails.title}`, emailContent);
            emailsSent++;
        }
        
        // ... (top 5 sorting logic - UNCHANGED)
        const sortedScores = allScores.sort((a, b) => b.score - a.score).slice(0, 5);
        const top5 = sortedScores.map((s, index) => `${index + 1}. ${s.fullName} (${s.score} marks)`);


        res.status(200).json({
            message: `Successfully processed results and sent emails to ${emailsSent} students.`,
            top5Students: top5,
            resultsCreated: resultsCreated,
        });

    } catch (error) {
        console.error('Send Results Mail/Scoring Error:', error);
        res.status(500).json({ message: 'Internal server error during paper scoring.' });
    }
};
// --- Teacher Function: Upload Questions (CSV Implementation) ---
const uploadQuestions = async (req, res) => {
    const file = req.file;
    // Teacher ID, Subject, and Difficulty are expected in the multipart form data body
    const { teacherId, subject, difficulty } = req.body; 
    
    if (!file || !teacherId || !subject || !difficulty) {
        // Clean up the temporary file if it exists and we have an error
        if (file) fs.unlinkSync(file.path);
        return res.status(400).json({ message: 'Missing CSV file, Teacher ID, Subject, or Difficulty.' });
    }

    const questionsToCreate = [];
    let fileError = null;
    let validCount = 0;
    let totalProcessed = 0;

    try {
        // 1. Read and parse the CSV stream
        const stream = fs.createReadStream(file.path)
            .pipe(csv({
                // Map the user's custom headers to internal keys
                mapHeaders: ({ header }) => {
                    switch (header.trim()) {
                        case 'Question': return 'text';
                        case 'Option A': return 'optionA';
                        case 'Option B': return 'optionB';
                        case 'Option C': return 'optionC';
                        case 'Option D': return 'optionD';
                        case 'Answer': return 'correctAnswer';
                        default: return null; // Ignore unknown columns
                    }
                }
            }));

        // 2. Process data stream asynchronously
        await new Promise((resolve, reject) => {
            stream.on('data', (data) => {
                totalProcessed++;
                // Check if basic fields and ENUMS are valid
                if (data.text && Subject[subject.toUpperCase()] && Difficulty[difficulty.toUpperCase()]) {
                    try {
                        const options = [data.optionA, data.optionB, data.optionC, data.optionD]
                            .filter(o => o && o.trim() !== ''); // Filter out empty options
                        questionsToCreate.push({
                            text: data.text,
                            options: options,
                            correctAnswer: options[0],
                            subject: Subject[subject.toUpperCase()], 
                            difficulty: Difficulty[difficulty.toUpperCase()], 
                            uploadedById: parseInt(teacherId),
                        });
                        console.log(options[0]);
                        validCount++;
                    } catch (e) {
                        console.error('Data structure error in row:', data, e.message);
                    }
                } else {
                    console.warn('Skipping row due to missing required data or invalid ENUM:', data);
                }
            });

            stream.on('end', () => resolve());
            stream.on('error', (err) => reject(err));
        });

        if (validCount === 0 && totalProcessed > 0) {
            return res.status(400).json({ message: 'CSV read successfully, but no valid questions found. Check column headers and data types.' });
        }
        if (validCount === 0) {
            return res.status(400).json({ message: 'CSV file was empty or stream error occurred.' });
        }


        // 3. Batch insert the validated questions into the database
        const result = await prisma.question.createMany({
            data: questionsToCreate,
            skipDuplicates: true,
        });

        // 4. Send success response
        res.status(201).json({ 
            message: `Processed ${totalProcessed} rows. Successfully added ${result.count} questions to the database.`, 
            totalProcessed: totalProcessed,
            totalAdded: result.count 
        });

    } catch (error) {
        console.error('Question Upload/Parsing Error:', error);
        res.status(500).json({ message: error.message || 'Internal server error during CSV processing.' });
    } finally {
        // 5. Clean up the temporary file
        if (file) {
            fs.unlink(file.path, (err) => {
                if (err) console.error('Error cleaning up file:', err);
            });
        }
    }
};

const registerTeacher = async (req, res) => {
    // ⚠️ In a real app, ensure this function is only callable by an authenticated ADMIN! (use auth middleware)
    const { fullName, email, studentId, temporaryPassword } = req.body;

    if (!fullName || !email || !temporaryPassword) {
        return res.status(400).json({ message: 'fullName, email and temporaryPassword are required.' });
    }

    try {
        // 1. Ensure email is not already used by another User
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: 'A user with this email already exists.' });
        }

        // 2. If a studentId (username) was provided, make sure it doesn't collide with existing students
        if (studentId) {
            const existingStudent = await prisma.student.findUnique({ where: { studentId } });
            if (existingStudent) {
                return res.status(409).json({ message: 'The provided Login ID is already in use by a student. Choose a different ID.' });
            }
        }

        // 3. Hash the temporary password and create the teacher user
        const hashedPassword = await hashPassword(temporaryPassword);

        const newTeacher = await prisma.user.create({
            data: {
                fullName,
                email,
                password: hashedPassword,
                role: 'TEACHER',
            },
        });
        
        /*
            Live monitoring.
            Reports 
            Add teacher -> idi aipoindi
            amazon vouchers
            Ranks
            // veetilo 
        */
        // 4. Prepare login identifier to send via email: use email as primary login for teachers
        const loginId = email;

        // 5. Send registration email (best-effort; sendMail logs if SMTP not configured)
        try {
            const emailContent = createRegistrationMail(fullName, loginId, temporaryPassword);
            sendMail(email, 'VIIT Portal - Teacher Registration', emailContent);
        } catch (mailErr) {
            console.error('Failed to send registration email to teacher:', mailErr);
        }

        // 6. Respond with created user info and guidance about login
        res.status(201).json({
            message: `Teacher ${fullName} created successfully. Use email as login ID: ${loginId}`,
            userId: newTeacher.id,
            loginIdProvidedByAdmin: studentId || null,
        });

    } catch (error) {
        console.error('Teacher Registration Error:', error);
        res.status(500).json({ message: 'Internal server error during teacher registration.' });
    }
};

// 🚨 NEW FUNCTION: Admin Password Change
const changeAdminPassword = async (req, res) => {
    // 🚨 CRITICAL CHANGE: Get the user ID from the verified JWT token
    const userId = req.user.id; 
    
    const { currentPassword, newPassword } = req.body;
    // We no longer need studentId from the body since the token identifies the user
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new password are required.' });
    }

    try {
        // 1. Fetch the user based on the verified ID from the token
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        // This check is mostly redundant if the token is valid, but good for safety
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        // 2. Compare current password with stored hash
        const isMatch = await comparePassword(currentPassword, user.password);
        
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect current password.' });
        }

        // 3. Hash the new password and update
        const newHashedPassword = await hashPassword(newPassword);

        await prisma.user.update({
            where: { id: userId }, // Update the user identified by the token
            data: { password: newHashedPassword },
        });

        res.status(200).json({ message: `${user.role} password updated successfully.` });

    } catch (error) {
        console.error('Password Change Error:', error);
        res.status(500).json({ message: 'Internal server error during password change.' });
    }
};

// --- NEW ADMIN FUNCTION: Get Admin Stats ---
const getAdminStats = async (req, res) => {
    try {
        // Total number of students
        const totalStudents = await prisma.student.count();

        const now = new Date();
        // Calculate the maximum end time for the start window that is still valid.
        // A paper must end its 15-minute grace period AFTER the current time.
        // Paper.startTime + 15 mins > Now
        const minStartTime = new Date(now.getTime() - LATE_START_WINDOW_MS);


        // Fetch only papers that are active AND whose 15-minute start window has not expired
        const upcomingExams = await prisma.questionPaper.findMany({
            where: { 
                isActive: true, 
                // 🚨 NEW FILTER: startTime must be greater than (Now - 15 minutes)
                startTime: {
                    gt: minStartTime, 
                },
            }, 
            select: { 
                id: true, 
                title: true, 
                durationHours: true, 
                totalMarks: true,
                createdAt: true,
                // 🚨 CRITICAL ADDITION
                startTime: true, 
            },
            // 🚨 NEW SORTING: Nearest upcoming first
            orderBy: {
                startTime: 'asc', 
            }
        });

        // Average score of all exams (for 160 marks papers)
        const averageScoreResult = await prisma.result.aggregate({
            _avg: { totalScore: true }
        });
        const averageScore = averageScoreResult._avg.totalScore || 0;

        res.status(200).json({
            totalStudents,
            upcomingExamsCount: upcomingExams.length,
            upcomingExamsDetails: upcomingExams,
            averageScore
        });

    } catch (error) {
        console.error('Get Admin Stats Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

const getExamStats = async (req, res) => {
    try {
        const totalStudents = await prisma.student.count();

        const now = new Date();

        // Find ongoing exam: active, now >= startTime, now <= startTime + durationHours
        const ongoingExam = await prisma.questionPaper.findFirst({
            where: {
                isActive: true,
                startTime: {
                    lte: now
                }
            },
            select: {
                id: true,
                title: true,
                startTime: true,
                durationHours: true
            }
        });

        if (!ongoingExam) {
            return res.status(200).json({
                totalStudents,
                attemptingStudents: 0,
                topRankers: []
            });
        }

        const examEndTime = new Date(ongoingExam.startTime.getTime() + ongoingExam.durationHours * 60 * 60 * 1000);

        if (now > examEndTime) {
            // Exam ended, no one attempting
            return res.status(200).json({
                totalStudents,
                attemptingStudents: 0,
                topRankers: []
            });
        }

        // Number attempting: ExamAttempt where paperId=ongoingExam.id and isCompleted=false
        const attemptingCount = await prisma.examAttempt.count({
            where: {
                paperId: ongoingExam.id,
                isCompleted: false
            }
        });

        // Top 5 rankers: from Result, where attempt.paperId=ongoingExam.id, order by totalScore desc, limit 5, include student.fullName
        const topRankers = await prisma.result.findMany({
            where: {
                examAttempt: {
                    paperId: ongoingExam.id
                }
            },
            orderBy: {
                totalScore: 'desc'
            },
            take: 5,
            include: {
                examAttempt: {
                    include: {
                        student: {
                            select: {
                                fullName: true
                            }
                        }
                    }
                }
            }
        });

        const rankers = topRankers.map(r => ({
            name: r.examAttempt.student.fullName,
            score: r.totalScore
        }));

        res.status(200).json({
            totalStudents,
            attemptingStudents: attemptingCount,
            topRankers: rankers
        });

    } catch (error) {
        console.error('Get Exam Stats Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

module.exports = {
    generateQuestionPaper,
    sendResultsMails,
    uploadQuestions,
    saveQuestionsToDb,
    generateCustomQuestionPaper, // 🚨 NEW EXPORT
    previewQuestionPaper, // 🚨 NEW EXPORT
    registerTeacher,
    changeAdminPassword,
    getAdminStats, // 🚨 NEW EXPORT
    getExamStats, // 🚨 NEW EXPORT
};