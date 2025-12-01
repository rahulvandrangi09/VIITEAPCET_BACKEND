// controllers/adminController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { sendMail, createResultMail } = require('../utils/mail');
const { Subject, Difficulty } = require('@prisma/client');

const fs = require('fs');
const csv = require('csv-parser');

// --- Helper for Random Selection ---
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// --- CORE ADMIN FUNCTION: Generate a balanced question paper ---
const generateQuestionPaper = async (req, res) => {
    const { adminId, title } = req.body;
    
    if (!adminId || !title) {
        return res.status(400).json({ message: 'Admin ID and title are required.' });
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

// --- CORE ADMIN FUNCTION: Send Mass Results Mails ---
const sendResultsMails = async (req, res) => {
    const { paperId } = req.body;
    
    if (!paperId) {
        return res.status(400).json({ message: 'Paper ID is required to send results.' });
    }

    try {
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
            const student = attempt.student;
            const paper = attempt.paper;
            
            // NOTE: DUMMY SCORING/ANALYSIS - Needs replacement with actual scoring logic (Phase 2)
            const analysis = {
                PHYSICS: { score: Math.floor(Math.random() * 40), total: 40, weakAreas: [] },
                CHEMISTRY: { score: Math.floor(Math.random() * 40), total: 40, weakAreas: [] },
                MATHS: { score: Math.floor(Math.random() * 80), total: 80, weakAreas: [] },
            };
            const finalScore = analysis.PHYSICS.score + analysis.CHEMISTRY.score + analysis.MATHS.score;

            allScores.push({ fullName: student.fullName, score: finalScore });

            const updatedAttempt = await prisma.examAttempt.update({
                where: { id: attempt.id },
                data: { score: finalScore }
            });

            if (!attempt.result) {
                await prisma.result.create({
                    data: {
                        attemptId: attempt.id,
                        totalScore: finalScore,
                        analysisJson: analysis,
                    }
                });
                resultsCreated++;
            }
            
            const emailContent = createResultMail(student.fullName, finalScore, paper.totalMarks, analysis);
            await sendMail(student.email, `Your Mock Exam Results: ${paper.title}`, emailContent);
            emailsSent++;
        }
        
        const sortedScores = allScores
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
            
        const top5 = sortedScores.map((s, index) => `${index + 1}. ${s.fullName} (${s.score} marks)`);


        res.status(200).json({
            message: `Successfully processed results and sent emails to ${emailsSent} students.`,
            top5Students: top5,
            resultsCreated: resultsCreated,
        });

    } catch (error) {
        console.error('Send Results Mail Error:', error);
        res.status(500).json({ message: 'Internal server error while processing results.' });
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
                            correctAnswer: data.correctAnswer || '',
                            subject: Subject[subject.toUpperCase()], 
                            difficulty: Difficulty[difficulty.toUpperCase()], 
                            uploadedById: parseInt(teacherId),
                        });
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


module.exports = {
    generateQuestionPaper,
    sendResultsMails,
    uploadQuestions,
};