// Controllers/authController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 
// NOTE: Make sure to install these: npm install bcryptjs jsonwebtoken

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
    // We assume 'studentId' holds the login ID/Username for all roles.
    const { studentId, password } = req.body; 

    if (!studentId || !password) {
        console.log(req);
        return res.status(400).json({ message: 'Username (ID) and password are required.' });
    }

    try {
        let user = null;

        // 1. Try to find the user in the TEACHER/ADMIN table (User model)
        // Since the User model doesn't have 'studentId', we must rely on 'email' or 'id' for Admin/Teacher login.
        // ASSUMPTION: Admin/Teacher log in using their UNIQUE EMAIL as the "studentId" input.
        user = await prisma.user.findUnique({
            where: { email: studentId }, 
        });

        // 2. If not found in the User table, try to find the user in the STUDENT table
        if (!user) {
            user = await prisma.student.findUnique({
                where: { studentId: studentId }, // This field exists on the Student model
            });
            
            // If we found a student, we manually attach the 'role' property 
            // since the Student model doesn't have it defined in the schema.
            if (user) {
                // IMPORTANT: This role must match your Role enum ('STUDENT', 'TEACHER', 'ADMIN')
                user.role = 'STUDENT'; 
            }
        }

        // --- Final Check ---
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials or user not found.' });
        }

        // 3. Compare the provided password with the stored hash
        const isPasswordValid = await comparePassword(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials. Incorrect password.' });
        }

        // 4. Generate a JWT token using the retrieved/attached role
        const token = generateToken(user.id, user.role);

        // 5. Successful Login Response
        res.status(200).json({
            message: `Login successful for role: ${user.role}`,
            token: token,
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role, // Will be 'ADMIN', 'TEACHER', or manually attached 'STUDENT'
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