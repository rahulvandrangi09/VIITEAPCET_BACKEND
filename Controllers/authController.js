// Controllers/authController.js
const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 
const crypto = require('crypto');
const { sendMail, createRegistrationMail } = require('../utils/mail');
// NOTE: Make sure to install these: npm install bcryptjs jsonwebtoken

// Salt rounds used for bcrypt hashing when creating student passwords
const SALT_ROUNDS = 10;

// --- Security Helper Functions ---

/**
 * Hashes a plaintext password using bcrypt.
 */
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

/**
 * Compares an input password with a stored hashed password.
 */
const comparePassword = (inputPassword, hashedPassword) => {
    return bcrypt.compare(inputPassword, hashedPassword);
};

/**
 * Generates a JSON Web Token (JWT) for session management.
 */
const generateToken = (userId, role) => {
    // ⚠️ IMPORTANT: JWT_SECRET must be set in your .env file!
    return jwt.sign({ id: userId, role: role }, process.env.JWT_SECRET, {
        expiresIn: '5h', // Token expires in 1 hour
    });
};


// --- CORE AUTH LOGIC ---

/**
 * Handles the registration of a new student (assuming student-specific logic like photo upload).
 */
const registerStudent = async (req, res) => {
    console.log(req.body);
    console.log(req?.file);
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
    const photo = req.file?.path; 
    
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
                photo:null,
                dateOfBirth: new Date(dob),
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


/**
 * Handles the login for all user types (Student, Teacher, Admin).
 */
const login = async (req, res) => {
    // Accept either an email or a studentId/unique id as `username` in the request body
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        let user = null;

        // If input looks like an email, try User -> Student by email
        if (typeof username === 'string' && username.includes('@')) {
            user = await prisma.user.findUnique({ where: { email: username } });
            if (!user) {
                user = await prisma.student.findUnique({ where: { email: username } });
                if (user) user.role = 'STUDENT';
            }
        } else {
            // Try Student by studentId first (common case)
            user = await prisma.student.findUnique({ where: { studentId: username } });
            if (user) {
                user.role = 'STUDENT';
            } else {
                // Fallbacks for teacher/admin: try User by email, then by id (if numeric)
                user = await prisma.user.findUnique({ where: { email: username } });
                if (!user) {
                    const numericId = parseInt(username, 10);
                    if (!isNaN(numericId)) {
                        user = await prisma.user.findUnique({ where: { id: numericId } });
                    }
                }
            }
        }

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials or user not found.' });
        }

        if (!user.password) {
            return res.status(401).json({ message: 'User has no password set.' });
        }

        const isPasswordValid = await comparePassword(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials. Incorrect password.' });
        }

        // Ensure a role exists (students are assigned above)
        const role = user.role || 'STUDENT';

        const token = generateToken(user.id, role);

        // Set cookie secure only in production; allow local dev/testing otherwise
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        };

        res.status(200)
            .cookie('token', token, cookieOptions)
            .json({
                message: `Login successful for role: ${role}`,
                token,
                user: {
                    id: user.id,
                    fullName: user.fullName,
                    email: user.email,
                    role,
                },
            });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
};

module.exports = {
    login,
    registerStudent,
    // Export security helpers for use in adminController (for creating teachers/changing passwords)
    hashPassword,
    comparePassword,
    generateToken, // Exported in case you need it for generating reset tokens later
};

/**
 * Generates a secure random password.
 */
const generatePassword = (length = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let password = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        password += chars[bytes[i] % chars.length];
    }
    return password;
};

/**
 * Generates a semi-readable unique student ID.
 */
const generateStudentId = () => {
    const prefix = 'VIIT';
    const ts = Date.now().toString().slice(-6);
    const rand = Math.floor(100 + Math.random() * 900); // 3-digit random
    return `${prefix}${ts}${rand}`;
};