// Controllers/studentAuth.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

// Ensure you have nodemailer installed and utils/mail.js is present
const { sendMail, createRegistrationMail } = require('../utils/mail'); 

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
    const { username:studentId, password } = req.body;

    if (!studentId || !password) {
        return res.status(400).json({ message: 'Login ID and password are required.' });
    }

    try {
        const student = await prisma.student.findUnique({
            where: { studentId: studentId },
        });

        if (!student) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const passwordMatch = await bcrypt.compare(password, student.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const accessToken = generateAccessToken(student.id);
        const refreshToken = generateRefreshToken(student.id);

        const updatedStudent = await prisma.student.update({
            where: { id: student.id },
            data: { refreshToken: refreshToken },
        });


        const options = {
            httpOnly: true,
            secure : true,
        }

        return res
               .status(200)
               .cookie('refreshToken', refreshToken, options)
               .cookie('accessToken', accessToken, options)
               .json({ 
                    message: 'Login successful.', 
                    student: { 
                        id: updatedStudent.id, 
                        studentId: updatedStudent.studentId,
                        email: updatedStudent.email,
                        accessToken: accessToken
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