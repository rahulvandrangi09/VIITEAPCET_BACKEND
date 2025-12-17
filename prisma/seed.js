const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs'); // Use bcryptjs
const prisma = new PrismaClient();

async function main() {
    const rawPassword = "admin@viit#31954";
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(rawPassword, salt);

    await prisma.user.upsert({
        where: { email: 'admin@viit' },
        update: { password: hash }, // Ensure we update the password if user exists
        create: {
            email: 'admin@viit',
            password: hash,
            fullName: 'Admin',
            role: 'ADMIN',
        },
    });
    console.log("✅ Admin seeded with password: admin@viit#31954");
}
main();