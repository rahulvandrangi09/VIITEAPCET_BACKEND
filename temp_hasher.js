// temp_hasher.js
const bcrypt = require('bcryptjs');
require('dotenv').config(); // Ensure dotenv is configured if you need to load anything

const generateHash = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

const main = async () => {
    // 🚨 CHOOSE YOUR ADMIN PASSWORD HERE 🚨
    const adminPassword = 'admin@viit#3195'; 
    
    const hash = await generateHash(adminPassword);
    
    console.log(`Original Password: ${adminPassword}`);
    console.log(`\n===================================================================`);
    console.log(`   🚨 COPY THIS HASH CAREFULLY for your Admin DB entry:`);
    console.log(`   ${hash}`);
    console.log(`===================================================================\n`);
};

main();