// ------------------------------------------------------------------
// CORRECTED: Import PrismaClient directly
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
// ------------------------------------------------------------------
const bcrypt = require('bcrypt');
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

const registerStudent = async (req, res) => {
    const studentData = req.body;
    
    if (!studentData.email || !studentData.fullName) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    const rawPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, SALT_ROUNDS);
    const studentId = generateStudentId();

    try {
        const newStudent = await prisma.student.create({
            data: {
                ...studentData,
                studentId: studentId,
                password: hashedPassword,
                dateOfBirth: new Date(studentData.dateOfBirth),
            },
        });

        const emailContent = createRegistrationMail(newStudent.fullName, studentId, rawPassword);
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

        let userToAuthenticate = student;
        let role = 'STUDENT';

        if (!student) {
            const user = await prisma.user.findUnique({
                where: { email: studentId }, 
            });

            if (!user) {
                 return res.status(401).json({ message: 'Invalid credentials.' });
            }
            userToAuthenticate = user;
            role = user.role;
        }

        const passwordMatch = await bcrypt.compare(password, userToAuthenticate.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        res.status(200).json({ 
            message: 'Login successful.', 
            user: { id: userToAuthenticate.id, identifier: studentId, fullName: userToAuthenticate.fullName, role: role } 
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