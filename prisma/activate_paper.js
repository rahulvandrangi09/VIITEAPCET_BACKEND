// prisma/activate_paper.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Attempting to activate the latest Question Paper...');

    try {
        // 1. Find the most recently created question paper
        const paper = await prisma.questionPaper.findFirst({
            orderBy: {
                id: 'desc',
            },
        });

        if (!paper) {
            console.log('No question papers found in the database. Please generate one first.');
            return;
        }

        if (paper.isActive) {
            console.log(`Question Paper ID ${paper.id} ("${paper.title}") is already active.`);
            return;
        }

        // 2. Update the paper to be active
        const updatedPaper = await prisma.questionPaper.update({
            where: { id: paper.id },
            data: { isActive: true },
        });

        console.log(`Successfully updated Question Paper ID ${updatedPaper.id} ("${updatedPaper.title}") to isActive: true.`);
        console.log('The exam should now appear on the student dashboard.');

    } catch (e) {
        console.error('Error activating question paper:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();