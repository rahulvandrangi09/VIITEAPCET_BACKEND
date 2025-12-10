// Controllers/studentAuth.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

// Ensure you have nodemailer installed and utils/mail.js is present
const jwt = require('jsonwebtoken');
const { sendMail, createRegistrationMail } = require('../utils/mail');

const SALT_ROUNDS = 10;

// Helper to generate a simple student ID
const generateStudentId = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(100 + Math.random() * 900); // 3-digit random
    return `VIIT${timestamp}${random}`;
};

// Helper to generate a simple random password
const generatePassword = () => {
    return Math.random().toString(36).slice(-8);
};

const generateAccessToken = function(studentId){
    return jwt.sign(
        {
            id: studentId
        },
        process.env.JWT_SECRET,
        {expiresIn: process.env.ACCESS_TOKEN_EXPIRY}
    )
}

const generateRefreshToken = function(studentId){
    return jwt.sign(
        {
            id: studentId
        },
        process.env.JWT_SECRET,
        {expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}

const registerStudent = async (req, res) => {
    const {
    fullName,
    fatherName,
    motherName,
    dob,
    gender,
    email,
    mobile: mobileNumber,
    altMobile: alternativeMobileNumber,
    stream,
    qualifyingExam,
    yearOfPassing,
    medium,
    placeOfStudy,
    category,
    minorityStatus,
    address,
    city,
    state,
    pincode,
    marks,
    collegeName,
    collegeAddress,
    } = req.body;
    
    // --- FIX: Capture the photo path from req.file.path (Multer result) ---
    // This path is local, e.g., 'uploads/1700000000000-photo.jpg'
    const photoPath = req.file?.path; 
    
    if (!email || !fullName) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    const rawPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, SALT_ROUNDS);
    const studentId = generateStudentId();

    try {
        const newStudent = await prisma.student.create({
            data: {
                studentId: studentId,
                password: hashedPassword,
                fullName,
                fatherName,
                motherName,
                gender,
                mobileNumber,
                alternativeMobileNumber,
                email,
                stream,
                qualifyingExam,
                yearOfPassing: parseInt(yearOfPassing),
                medium,
                placeOfStudy,
                category,
                minorityStatus,
                address,
                city,
                state,
                pincode,
                marks,
                collegeName,
                collegeAddress,
                // --- FIX: Store the photo path in the DB ---
                photo: photoPath, 
                dateOfBirth: new Date(dob),
            },
        });

        // --- AUTH/MAIL: Send credentials via real email ---
        const emailContent = createRegistrationMail(newStudent.fullName, studentId, rawPassword);
        // This will now use Nodemailer and your .env credentials
        sendMail(newStudent.email, 'VIIT Portal Registration Successful', emailContent);

        res.status(201).json({ 
            message: 'Registration successful. Check your email for login details.', 
            student: { 
                id: newStudent.id, 
                studentId: newStudent.studentId,
                email: newStudent.email
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'Email or Student ID already in use.' });
        }
        res.status(500).json({ message: 'Internal server error during registration.' });
    }
};
const login = async (req, res) => {
    const { studentId, password } = req.body;

    if (!studentId || !password) {
        return res.status(400).json({ message: 'Login ID and password are required.' });
    }

    try {
        const student = await prisma.student.findUnique({
            where: { studentId: studentId },
        });

        let userToAuthenticate;
        let role;
        
        // --- 1. Check if it's a Student login ---
        if (student) {
            userToAuthenticate = student;
            role = 'STUDENT';
        } else {
            // --- 2. Check if it's a Admin/Teacher login (using email as ID) ---
            const user = await prisma.user.findUnique({
                where: { email: studentId }, 
            });

            if (user) {
                userToAuthenticate = user;
                role = user.role;
            } else {
                // --- 3. Neither Student nor Admin/Teacher found ---
                return res.status(401).json({ message: 'Invalid credentials. User not found.' });
            }
        }

        // --- 4. Password check ---
        const passwordMatch = await bcrypt.compare(password, userToAuthenticate.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid credentials. Password incorrect.' });
        }

        // --- 5. SUCCESS RESPONSE (Ensure all fields are present!) ---
        res.status(200).json({ 
            message: 'Login successful.', 
            user: { 
                id: userToAuthenticate.id, 
                // Use the input ID for identifier
                identifier: studentId, 
                fullName: userToAuthenticate.fullName, 
                role: role // <-- This must be defined and sent!
            } 
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
};

module.exports = {
    registerStudent,
    login,
};