// prisma/seed.js
const { PrismaClient, Role, Subject, Difficulty } = require('@prisma/client');
const bcrypt = require('bcrypt');
// CHANGE: Instantiate PrismaClient directly, using the default import
const prisma = new PrismaClient(); 
const SALT_ROUNDS = 10;

async function main() {
    console.log('Start seeding...');

    const hashedPassword = await bcrypt.hash('password123', SALT_ROUNDS);

    // --- 1. Create Default Admin ---
    const admin = await prisma.user.upsert({
        where: { email: 'admin@viit.edu' },
        update: {},
        create: {
            email: 'admin@viit.edu',
            password: hashedPassword,
            fullName: 'VIIT Portal Administrator',
            role: Role.ADMIN,
        },
    });
    console.log(`Created/Updated Admin user with ID: ${admin.id}`);

    // --- 2. Create Default Teacher ---
    const teacher = await prisma.user.upsert({
        where: { email: 'teacher@viit.edu' },
        update: {},
        create: {
            email: 'teacher@viit.edu',
            password: hashedPassword,
            fullName: 'Physics Faculty',
            role: Role.TEACHER,
        },
    });
    console.log(`Created/Updated Teacher user with ID: ${teacher.id}`);

    // --- 3. Seed Mock Questions (Needed for Paper Generation Test) ---
    console.log('Seeding mock questions...');
    const questions = [
        // Physics - Easy
        { text: 'Which phenomenon is responsible for the twinkling of stars?', options: ['Reflection', 'Refraction', 'Dispersion', 'Scattering'], correctAnswer: 'Refraction', subject: Subject.PHYSICS, difficulty: Difficulty.EASY, uploadedById: teacher.id },
        { text: 'What is the SI unit of force?', options: ['Joule', 'Watt', 'Newton', 'Pascal'], correctAnswer: 'Newton', subject: Subject.PHYSICS, difficulty: Difficulty.EASY, uploadedById: teacher.id },
        { text: 'What is the formula for kinetic energy?', options: ['mgh', '1/2 mv^2', 'F.d', 'P.t'], correctAnswer: '1/2 mv^2', subject: Subject.PHYSICS, difficulty: Difficulty.EASY, uploadedById: teacher.id },
        
        // Physics - Medium
        { text: 'A car accelerates from rest at 2 m/s². What is its speed after 5 seconds?', options: ['5 m/s', '10 m/s', '15 m/s', '20 m/s'], correctAnswer: '10 m/s', subject: Subject.PHYSICS, difficulty: Difficulty.MEDIUM, uploadedById: teacher.id },
        { text: 'Define the process of adiabatic expansion.', options: ['Constant Pressure', 'Constant Volume', 'No heat exchange', 'Constant Temperature'], correctAnswer: 'No heat exchange', subject: Subject.PHYSICS, difficulty: Difficulty.MEDIUM, uploadedById: teacher.id },
        
        // Chemistry - Hard
        { text: 'What is the primary role of the catalyst in a chemical reaction?', options: ['Increase Temperature', 'Increase Product Yield', 'Lower Activation Energy', 'Change Equilibrium'], correctAnswer: 'Lower Activation Energy', subject: Subject.CHEMISTRY, difficulty: Difficulty.HARD, uploadedById: teacher.id },
        
        // Maths - Easy
        { text: 'What is the value of 2x + 3 when x = 4?', options: ['7', '8', '11', '12'], correctAnswer: '11', subject: Subject.MATHS, difficulty: Difficulty.EASY, uploadedById: teacher.id },
        
        // Add more questions to meet the 160 question requirement (40 P, 40 C, 80 M) for a full paper test.
        // For testing the paper generation logic, we need more than 30% of 160, so ideally >50 questions in total.
        
        // Seeding 40 questions (20 P, 10 C, 10 M) total to enable a partial paper creation test:
        ...Array(15).fill().map((_, i) => ({ text: `P15: Mock Physics Easy Q${i+1}`, options: ['A','B','C','D'], correctAnswer: 'A', subject: Subject.PHYSICS, difficulty: Difficulty.EASY, uploadedById: teacher.id })),
        ...Array(5).fill().map((_, i) => ({ text: `P5: Mock Physics Medium Q${i+1}`, options: ['A','B','C','D'], correctAnswer: 'B', subject: Subject.PHYSICS, difficulty: Difficulty.MEDIUM, uploadedById: teacher.id })),
        
        ...Array(5).fill().map((_, i) => ({ text: `C5: Mock Chemistry Easy Q${i+1}`, options: ['A','B','C','D'], correctAnswer: 'A', subject: Subject.CHEMISTRY, difficulty: Difficulty.EASY, uploadedById: teacher.id })),
        ...Array(5).fill().map((_, i) => ({ text: `C5: Mock Chemistry Medium Q${i+1}`, options: ['A','B','C','D'], correctAnswer: 'B', subject: Subject.CHEMISTRY, difficulty: Difficulty.MEDIUM, uploadedById: teacher.id })),
        
        ...Array(5).fill().map((_, i) => ({ text: `M5: Mock Maths Easy Q${i+1}`, options: ['A','B','C','D'], correctAnswer: 'A', subject: Subject.MATHS, difficulty: Difficulty.EASY, uploadedById: teacher.id })),
        ...Array(5).fill().map((_, i) => ({ text: `M5: Mock Maths Medium Q${i+1}`, options: ['A','B','C','D'], correctAnswer: 'B', subject: Subject.MATHS, difficulty: Difficulty.MEDIUM, uploadedById: teacher.id })),
    ];
    
    const count = await prisma.question.createMany({
        data: questions,
        skipDuplicates: true,
    });
    console.log(`Seeded ${count.count} mock questions.`);

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });