// server.js
const express = require('express');
const dotenv = require('dotenv');
const prisma = require('./utils/prisma');
const multer = require('multer'); // <--- Multer for file uploads
const path = require('path');     // <--- Path for file paths
const fs = require('fs');
// Ensure server uses IST (+05:30) for current-time calls across the app
require('./utils/ist');
const { protect, authorize } = require('./middleware/authMiddleware');
// Initialize Controllers and Prisma
const authController = require('./Controllers/authController');
const adminController = require('./Controllers/adminController');
const studentController = require('./Controllers/studentController');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Multer Configuration ---
// Destination storage for uploaded CSV files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create the 'uploads' directory if it doesn't exist
        const uploadDir = path.join(__dirname, 'uploads/');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Rename file to prevent collisions
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB file limit
});
// ----------------------------

// Middleware
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); // Important for form data parsing

// --- NEW LINE: Serve the uploaded images ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use((req, res, next) => {
    // Allow access from any origin (your React app on 5173)
    res.header('Access-Control-Allow-Origin', '*'); 
    
    // Allow common methods
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    
    // Allow required headers
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight request (OPTIONS)
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});


// Basic Health Check
app.get('/', (req, res) => {
    res.send('VIIT Mock Portal Backend is running.');
});

// --- AUTH ROUTES ---
app.post('/api/auth/register', upload.single('photo'), authController.registerStudent); 
app.post('/api/auth/login', authController.login);
app.post('/api/auth/change-password', adminController.changeAdminPassword);
app.post('/api/admin/register-teacher', protect, authorize('ADMIN'), adminController.registerTeacher);
// --- ADMIN ROUTES ---
app.post('/api/admin/create-paper', protect, authorize('ADMIN'), adminController.generateQuestionPaper);
app.post('/api/admin/send-results', protect, authorize('ADMIN'), adminController.sendResultsMails);
app.post('/api/admin/create-paper-custom', protect, authorize('ADMIN'), adminController.generateCustomQuestionPaper);
app.get('/api/admin/preview-paper/:paperId', protect, authorize('ADMIN', 'TEACHER'), adminController.previewQuestionPaper);
app.get('/api/admin/top-students/:paperId', protect, authorize('ADMIN'), adminController.getTopStudents);
app.get('/api/admin/stats', protect, authorize('ADMIN','TEACHER'), adminController.getAdminStats);
app.get('/api/admin/exam-stats', protect, authorize('ADMIN', 'TEACHER'), adminController.getExamStats);
app.get('/api/admin/reports', protect, authorize('ADMIN', 'TEACHER'), adminController.getReports);
app.get('/api/admin/total-questions', protect, authorize('ADMIN','TEACHER'), adminController.getQuestionCounts);
app.get('/api/admin/difficulty-availability', protect, authorize('ADMIN','TEACHER'), adminController.getDifficultyAvailability);

// --- NEW CUSTOM DIFFICULTY FLOW ROUTES ---
app.get('/api/admin/difficulty-stats/:examId', protect, authorize('ADMIN', 'TEACHER'), adminController.getDifficultyStats);
app.post('/api/admin/generate-custom', protect, authorize('ADMIN', 'TEACHER'), adminController.generateCustomExam);

// --- TEACHER ROUTES ---
// Applied upload.single('csvFile') middleware to handle the file upload
app.post('/api/teacher/save-questions', protect, authorize('ADMIN', 'TEACHER'), upload.any(), adminController.saveQuestionsToDb);
app.post('/api/teacher/upload-questions', protect, authorize('ADMIN', 'TEACHER'), upload.single('csvFile'), adminController.uploadQuestions);

// --- STUDENT ROUTES ---
// 🚨 MOVED ROUTE: The getAttemptResult route is now correctly placed here.
app.get('/api/student/result', protect, authorize('STUDENT'), studentController.getAttemptResult); 
app.get('/api/student/results/history', protect, authorize('STUDENT'), studentController.getStudentResultsHistory);
app.get('/api/student/exams', protect, authorize('STUDENT'), studentController.getAvailableExams);
app.post('/api/student/start-exam', protect, authorize('STUDENT'), studentController.startExam);
app.post('/api/student/submit-attempt', protect, authorize('STUDENT'), studentController.submitAttempt);
app.post('/api/student/verify-code',protect,authorize('STUDENT'),studentController.verifyCode);

// Connect to DB and Start Server
async function main() {
    try {
        await prisma.$connect();
        console.log('Database connection successful.');

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Access the backend at http://localhost:${PORT}`);
        });
    } catch (e) {
        console.error('Failed to start server or connect to database:', e);
        process.exit(1);
    }
}

main();

// Graceful shutdown
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    console.log('Prisma client disconnected. Server shutting down.');
    process.exit(0);
});