// server.js
const express = require('express');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer'); // <--- Multer for file uploads
const path = require('path');     // <--- Path for file paths
const fs = require('fs')
// Initialize Controllers and Prisma
const authController = require('./Controllers/studentAuth');
const adminController = require('./Controllers/adminController');
const studentController = require('./controllers/studentController');
const prisma = new PrismaClient();

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
app.post('/api/auth/register',upload.single('photo'),authController.registerStudent);
app.post('/api/auth/login', authController.login);


// --- ADMIN ROUTES ---
app.post('/api/admin/create-paper', adminController.generateQuestionPaper);
app.post('/api/admin/send-results', adminController.sendResultsMails);

app.post('/api/admin/create-paper-custom', adminController.generateCustomQuestionPaper);


// New Route for Preview
app.get('/api/admin/preview-paper/:paperId', adminController.previewQuestionPaper);

// --- TEACHER ROUTES ---
// Applied upload.single('csvFile') middleware to handle the file upload
app.post('/api/teacher/save-questions', upload.any(), adminController.saveQuestionsToDb);
app.post('/api/teacher/upload-questions', upload.single('csvFile'), adminController.uploadQuestions);

// --- STUDENT ROUTES ---
// 🚨 MOVED ROUTE: The getAttemptResult route is now correctly placed here.
app.get('/api/student/result', studentController.getAttemptResult); 
app.get('/api/student/results/history', studentController.getStudentResultsHistory);

app.get('/api/student/exams', studentController.getAvailableExams);
app.post('/api/student/start-exam', studentController.startExam);
app.post('/api/student/submit-attempt', studentController.submitAttempt);

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