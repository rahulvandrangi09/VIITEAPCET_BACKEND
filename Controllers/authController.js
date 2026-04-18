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
    password,
    email,
    mobile: mobileNumber,
    altMobile: alternativeMobileNumber,
    // stream,
    // qualifyingExam,
    // yearOfPassing,
    // medium,
    // placeOfStudy,
    // category,
    // minorityStatus,
    // address,
    // city,
    // state,
    // pincode,
    // marks,
    // collegeName,
    // collegeAddress,
    } = req.body;
    // const photo = req.file?.path; 
    
    if (!email || !fullName) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    const rawPassword = password;
    const hashedPassword = await bcrypt.hash(rawPassword, SALT_ROUNDS);
    const studentId = email;

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
                // stream,
                // qualifyingExam,
                // yearOfPassing: parseInt(yearOfPassing),
                // medium,
                // placeOfStudy,
                // category,
                // minorityStatus,
                // address,
                // city,
                // state,
                // pincode,
                // marks,
                // collegeName,
                // collegeAddress,
                // photo:null,
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
    // 1. Explicitly destructure email and password
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        let user = null;
        let role = 'STUDENT'; // Default role assumption

        // 2. Try to find the user in the Student table first
        user = await prisma.student.findUnique({ 
            where: { email: email } 
        });

        // 3. If not found in Student, check the User table (for Teachers/Admins)
        if (!user) {
            user = await prisma.user.findUnique({ 
                where: { email: email } 
            });
            
            // If found in the User table, grab their specific role
            if (user) {
                role = user.role; 
            }
        }

        // 4. If neither table has this email, return error
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials. User not found.' });
        }

        // 5. Ensure the user actually has a password field set
        if (!user.password) {
            return res.status(401).json({ message: 'User has no password set.' });
        }

        // 6. Verify password
        const isPasswordValid = await comparePassword(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials. Incorrect password.' });
        }

        // 7. Generate JWT Token
        const token = generateToken(user.id, role);

        // 8. Set cookie options
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        };

        // 9. Send success response
        res.status(200)
            .cookie('token', token, cookieOptions)
            .json({
                message: `Login successful for role: ${role}`,
                token,
                user: {
                    id: user.id,
                    fullName: user.fullName,
                    email: user.email,
                    role, // Dynamically set to 'STUDENT', 'TEACHER', or 'ADMIN'
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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
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