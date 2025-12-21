// controllers/adminController.js
const prisma = require('../utils/prisma');
const { sendMail, createResultMail, createRegistrationMail, createResultMailWithVoucher } = require('../utils/mail');
const { Subject, Difficulty } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { hashPassword, comparePassword } = require('./authController');
const LATE_START_WINDOW_MS = 15 * 60 * 1000;



// ⚠️ IMPORTANT: Set a default ID for the uploader for the foreign key constraint.
// You must ensure a User with this ID exists (Teacher or Admin role).
const DEFAULT_UPLOADER_ID = 1;

const getFilePath = (imageKey, uploadedFiles) => {
    if (!imageKey) return null;
    const file = uploadedFiles.find(f => f.fieldname === imageKey);
    // Returns a path like: /uploads/1700000000000-image.png
    return file ? path.join('/uploads', file.filename) : null; 
};

// Small helper to decode basic HTML entities back to characters/tags
const decodeHtmlEntities = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
};


const generateCustomQuestionPaper = async (req, res) => {
    const { adminId, title, distribution, durationHours, startTime } = req.body;

    try {
        // 1. Fetch all available questions
        const allQuestions = await prisma.question.findMany({
            select: { id: true, subject: true, difficulty: true, topic: true }
        });

        // 2. Map questions: [Subject][Difficulty][Topic] -> [Array of IDs]
        const availabilityMap = {};
        allQuestions.forEach(q => {
            if (!availabilityMap[q.subject]) availabilityMap[q.subject] = {};
            if (!availabilityMap[q.subject][q.difficulty]) availabilityMap[q.subject][q.difficulty] = {};
            if (!availabilityMap[q.subject][q.difficulty][q.topic]) {
                availabilityMap[q.subject][q.difficulty][q.topic] = [];
            }
            availabilityMap[q.subject][q.difficulty][q.topic].push(q.id);
        });

        let allSelectedQuestions = [];
        let totalQuestionsCount = 0;
        const subjectBreakdown = {};

        // 3. Iterate through the distribution (MATHEMATICS, PHYSICS, etc.)
        for (const subjectKey in distribution) {
            const difficulties = distribution[subjectKey]; 
            subjectBreakdown[subjectKey] = { total: 0, topics: {} };

            for (const diffKey in difficulties) {
                const targetCount = parseInt(difficulties[diffKey]);
                if (targetCount <= 0) continue;

                // Find all topics existing for this Subject + Difficulty
                const topicsMap = availabilityMap[subjectKey]?.[diffKey] || {};
                const topicNames = Object.keys(topicsMap);

                if (topicNames.length === 0) {
                    return res.status(400).json({ 
                        message: `No questions found for ${subjectKey} with difficulty ${diffKey}.` 
                    });
                }

                // --- BALANCING LOGIC ---
                const numTopics = topicNames.length;
                const basePerTopic = Math.floor(targetCount / numTopics);
                let remainder = targetCount % numTopics;

                // Shuffle topics so the "extra" questions from the remainder aren't always given to the same topics
                const shuffledTopicNames = shuffleArray([...topicNames]);

                for (const topicName of shuffledTopicNames) {
                    let countToTake = basePerTopic + (remainder > 0 ? 1 : 0);
                    if (remainder > 0) remainder--;

                    const availableIds = topicsMap[topicName];

                    if (availableIds.length < countToTake) {
                        return res.status(400).json({
                            message: `Insufficient questions in "${topicName}" (${subjectKey} ${diffKey}). Needed: ${countToTake}, Available: ${availableIds.length}.`
                        });
                    }

                    // Pick random questions from this topic
                    const selected = shuffleArray([...availableIds]).slice(0, countToTake);
                    
                    selected.forEach(id => {
                        allSelectedQuestions.push({ id });
                        totalQuestionsCount++;
                        
                        // Update breakdown for the response
                        if (!subjectBreakdown[subjectKey].topics[topicName]) {
                            subjectBreakdown[subjectKey].topics[topicName] = 0;
                        }
                        subjectBreakdown[subjectKey].topics[topicName]++;
                    });
                }
            }
        }
        console.log('Total selected questions:', totalQuestionsCount);
        // 4. Save to Database
        shuffleArray(allSelectedQuestions); // Final randomize for the actual paper order

        const newPaper = await prisma.questionPaper.create({
            data: {
                title,
                createdById: parseInt(adminId),
                durationHours: parseInt(durationHours) || 3,
                startTime: new Date(startTime),
                totalMarks: totalQuestionsCount,
                paperQuestions: {
                    create: allSelectedQuestions.map(q => ({ questionId: q.id }))
                }
            }
        });

        res.status(201).json({
            message: 'Balanced Question Paper created successfully.',
            paperId: newPaper.id,
            totalQuestions: totalQuestionsCount,
            breakdown: subjectBreakdown
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error.' });
    }
}; 

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

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

        const baseUrl = req.protocol + '://' + req.get('host');

        const questions = paper.paperQuestions
            .map(pq => {
                const q = pq.question;
                // Option image fields are stored as optionAImageUrl, optionBImageUrl, ...
                const optionImageFields = ['optionAImageUrl','optionBImageUrl','optionCImageUrl','optionDImageUrl'];

                // Build options with possible images
                const options = (q.options || []).map((opt, idx) => {
                    const imgField = optionImageFields[idx];
                    const imgPath = q[imgField] ? (baseUrl + q[imgField]) : null;
                    return {
                        text: opt,
                        image: imgPath
                    };
                });

                // Question-level image (if present)
                const questionImage = q.questionImageUrl ? (baseUrl + q.questionImageUrl) : null;

                // Compose an HTML snippet that clients can render with innerHTML/dangerouslySetInnerHTML
                // This includes decoded question text and any images for question/options.
                const decodedText = decodeHtmlEntities(q.text || '');
                let html = decodedText;
                if (questionImage) {
                    html += `<div><img src="${questionImage}" alt="question image" style="max-width:100%;height:auto;"/></div>`;
                }

                // Append options HTML
                html += '<ol type="A">';
                options.forEach((op, i) => {
                    const label = String.fromCharCode(65 + i); // A, B, C, D
                    if (op.image) {
                        html += `<li><div>${op.text ? decodeHtmlEntities(op.text) : ''}</div><div><img src="${op.image}" alt="option ${label}" style="max-width:100%;height:auto;"/></div></li>`;
                    } else {
                        html += `<li>${decodeHtmlEntities(op.text || '')}</li>`;
                    }
                });
                html += '</ol>';

                return {
                    id: q.id,
                    text: q.text,
                    html, // HTML-safe string for client rendering
                    options: options.map(o => o.text),
                    optionImages: options.map(o => o.image),
                    correctAnswer: q.correctAnswer,
                    subject: q.subject,
                    difficulty: q.difficulty,
                    questionImage
                };
            })
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
                topic: q.topic,
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
                isActive: true,
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

// --- NEW FUNCTION: Get Top 10 Students for a Paper ---
const getTopStudents = async (req, res) => {
    const { paperId } = req.params;
    
    if (!paperId) {
        return res.status(400).json({ message: 'Paper ID is required.' });
    }

    try {
        const topStudents = await prisma.examAttempt.findMany({
            where: {
                paperId: parseInt(paperId),
                isCompleted: true
            },
            orderBy: {
                score: 'desc'
            },
            take: 10,
            include: {
                student: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                }
            }
        });

        const formattedStudents = topStudents.map(attempt => ({
            studentId: attempt.student.id,
            name: attempt.student.fullName,
            email: attempt.student.email,
            score: attempt.score,
            rank: topStudents.indexOf(attempt) + 1
        }));

        res.status(200).json({
            topStudents: formattedStudents
        });

    } catch (error) {
        console.error('Get Top Students Error:', error);
        res.status(500).json({ message: 'Failed to fetch top students.' });
    }
};

// --- CORE ADMIN FUNCTION: Send Mass Results Mails with Optional Vouchers ---
const sendResultsMails = async (req, res) => {
    const { paperId, vouchers } = req.body;
    
    if (!paperId) return res.status(400).json({ message: 'Paper ID is required.' });

    try {
        const paper = await prisma.questionPaper.findUnique({
            where: { id: parseInt(paperId) },
            include: {
                examAttempts: {
                    where: { isCompleted: true },
                    include: { 
                        student: true, 
                        result: true // This contains the subject-wise analysisJson
                    },
                    orderBy: {
                        score: 'desc'
                    }
                }
            }
        });

        if (!paper || paper.examAttempts.length === 0) {
            return res.status(404).json({ message: 'No completed attempts found for this paper.' });
        }

        // Create a map of top students to their voucher codes (rank 1-10)
        const voucherMap = {};
        if (vouchers && Array.isArray(vouchers)) {
            vouchers.forEach((voucher, index) => {
                if (index < paper.examAttempts.length) {
                    voucherMap[paper.examAttempts[index].student.id] = voucher.code;
                }
            });
        }

        let emailsSent = 0;
        let vouchersSent = 0;

        for (let i = 0; i < paper.examAttempts.length; i++) {
            const attempt = paper.examAttempts[i];
            try {
                // FALLBACK: Use attempt.score if result record is missing
                const finalScore = attempt.score !== null ? attempt.score : 0;
                const analysis = attempt.result?.analysisJson || {};
                const voucherCode = voucherMap[attempt.student.id] || null;

                let emailContent;
                if (voucherCode) {
                    // Top 10 student - send voucher email
                    emailContent = createResultMailWithVoucher(
                        attempt.student.fullName,
                        finalScore,
                        paper.totalMarks,
                        analysis,
                        voucherCode,
                        i + 1 // Rank
                    );
                    vouchersSent++;
                } else {
                    // Regular student - send normal result email
                    emailContent = createResultMail(
                        attempt.student.fullName,
                        finalScore,
                        paper.totalMarks,
                        analysis
                    );
                }

                await sendMail(attempt.student.email, `Results for ${paper.title}`, emailContent);
                emailsSent++;
            } catch (err) {
                console.error(`Error processing email for student ID ${attempt.studentId}:`, err.message);
            }
        }

        res.status(200).json({ 
            message: `Successfully sent results to ${emailsSent} students. ${vouchersSent} students received voucher codes.` 
        });

    } catch (error) {
        console.error('sendResultsMails Error:', error);
        res.status(500).json({ message: 'Failed to send emails.' });
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
                email:studentId,
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
        const loginId = studentId;

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
            orderBy: {
                startTime: 'desc'
            },
            select: {
                id: true,
                title: true,
                startTime: true,
                durationHours: true,
                totalMarks: true
            }
        });

        if (!ongoingExam) {
            // Find the most recent exam that has been attempted
            const previousExam = await prisma.questionPaper.findFirst({
                where: {
                    examAttempts: {
                        some: {} // has at least one attempt
                    }
                },
                orderBy: {
                    startTime: 'desc'
                },
                select: {
                    id: true,
                    title: true,
                    startTime: true,
                    durationHours: true,
                    totalMarks: true
                }
            });

            if (previousExam) {
                // Get top rankers for the previous exam
                const topRankers = await prisma.examAttempt.findMany({
                    where: {
                        paperId: previousExam.id,
                        isCompleted: true
                    },
                    orderBy: {
                        score: 'desc'
                    },
                    take: 5,
                    include: {
                        student: {
                            select: {
                                fullName: true
                            }
                        }
                    }
                });

                const rankers = topRankers.map(r => ({
                    name: r.student.fullName,
                    score: r.score
                }));

                return res.status(200).json({
                    message: 'No ongoing exam. Showing details of the last attempted exam.',
                    totalStudents,
                    attemptingStudents: 0,
                    topRankers: rankers,
                    currentExam: previousExam
                });
            } else {
                return res.status(200).json({
                    message: 'No ongoing exam and no previous attempted exams.',
                    totalStudents,
                    attemptingStudents: 0,
                    topRankers: [],
                    currentExam: null
                });
            }
        }

        const examEndTime = new Date(ongoingExam.startTime.getTime() + ongoingExam.durationHours * 60 * 60 * 1000);

        if (now > examEndTime) {
            // Exam ended, fetch top rankers for the completed exam
            const topRankers = await prisma.examAttempt.findMany({
                where: {
                    paperId: ongoingExam.id,
                    isCompleted: true
                },
                orderBy: {
                    score: 'desc'
                },
                take: 5,
                include: {
                    student: {
                        select: {
                            fullName: true
                        }
                    }
                }
            });

            const rankers = topRankers.map(r => ({
                name: r.student.fullName,
                score: r.score
            }));

            return res.status(200).json({
                message: 'Exam has ended. Showing final results.',
                totalStudents,
                attemptingStudents: 0,
                topRankers: rankers,
                currentExam: ongoingExam
            });
        }

        // Number attempting: students with isAttemptingExam = true
        const attemptingCount = await prisma.student.count({
            where: {
                isAttemptingExam: true
            }
        });

        // Top 5 rankers: from ExamAttempt where paperId=ongoingExam.id, isCompleted=true, order by score desc, limit 5, include student.fullName
        const topRankers = await prisma.examAttempt.findMany({
            where: {
                paperId: ongoingExam.id,
                isCompleted: true
            },
            orderBy: {
                score: 'desc'
            },
            take: 5,
            include: {
                student: {
                    select: {
                        fullName: true
                    }
                }
            }
        });

        const rankers = topRankers.map(r => ({
            name: r.student.fullName,
            score: r.score
        }));
        console.log(ongoingExam,rankers,attemptingCount,totalStudents);
        res.status(200).json({
            message: 'Exam is currently ongoing.',
            totalStudents,
            attemptingStudents: attemptingCount,
            topRankers: rankers,
            currentExam: ongoingExam
        });

    } catch (error) {
        console.error('Get Exam Stats Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};

// --- Get Comprehensive Reports ---
const getReports = async (req, res) => {
    try {
        // 1. Fetch total student count ONCE, not inside a loop
        const registeredForExam = await prisma.student.count();

        // 2. Fetch papers with necessary relations
        const papers = await prisma.questionPaper.findMany({
            include: {
                examAttempts: {
                    where: { isCompleted: true },
                    include: {
                        result: true,
                    }
                },
                _count: {
                    select: { 
                        examAttempts: true, // This gives total "attempted" count
                        paperQuestions: true 
                    }
                },
                paperQuestions: {
                    select: {
                        question: {
                            select: { subject: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // 3. Process in-memory (much faster than DB calls in a loop)
        const reports = papers.map((paper) => {
            const completedAttempts = paper.examAttempts;
            const completedCount = completedAttempts.length;
            const attemptedCount = paper._count.examAttempts;
            
            // Calculate average score
            const totalScore = completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
            const avgScore = completedCount > 0 ? (totalScore / completedCount).toFixed(1) : "0";
            
            // Subject Analytics
            const subjectStats = {
                PHYSICS: { score: 0, count: 0, totalQuestions: 0 },
                CHEMISTRY: { score: 0, count: 0, totalQuestions: 0 },
                MATHEMATICS: { score: 0, count: 0, totalQuestions: 0 }
            };

            // Count questions per subject from the paper
            paper.paperQuestions.forEach(pq => {
                const sub = pq.question.subject;
                if (subjectStats[sub]) subjectStats[sub].totalQuestions++;
            });

            // Aggregate subject scores from results
            completedAttempts.forEach(attempt => {
                if (attempt.result?.analysisJson) {
                    const analysis = attempt.result.analysisJson;
                    Object.keys(subjectStats).forEach(sub => {
                        const data = analysis[sub] || analysis[sub.toLowerCase()];
                        if (data) {
                            subjectStats[sub].score += (data.score || 0);
                            subjectStats[sub].count++;
                        }
                    });
                }
            });

            const subjectAnalytics = Object.entries(subjectStats)
                .filter(([_, stats]) => stats.totalQuestions > 0)
                .map(([subject, stats]) => ({
                    subject,
                    avgScore: stats.count > 0 ? (stats.score / stats.count).toFixed(1) : "0",
                    maxMarks: stats.totalQuestions,
                    totalQuestions: stats.totalQuestions
                }));

            return {
                id: paper.id,
                title: paper.title,
                startDate: paper.startTime,
                totalMarks: paper.totalMarks,
                status: paper.isActive ? 'Active' : 'Complete',
                feedback: (completedCount > 0 ? (parseFloat(avgScore) / paper.totalMarks) * 10 : 0).toFixed(1),
                registered: registeredForExam,
                attempted: attemptedCount,
                completed: completedCount,
                attemptPercentage: registeredForExam > 0 ? ((attemptedCount / registeredForExam) * 100).toFixed(0) : "0",
                avgScore: avgScore,
                subjectAnalytics
            };
        });

        res.status(200).json({ success: true, reports });
    } catch (error) {
        console.error('Get Reports Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch reports due to server timeout.' });
    }
};

module.exports = {
    generateQuestionPaper,
    sendResultsMails,
    uploadQuestions,
    saveQuestionsToDb,
    generateCustomQuestionPaper,
    previewQuestionPaper,
    registerTeacher,
    changeAdminPassword,
    getAdminStats,
    getExamStats,
    getReports,
    getTopStudents, // 🚨 NEW EXPORT
};