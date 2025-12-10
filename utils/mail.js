// utils/mail.js

const nodemailer = require('nodemailer');
// Load environment variables (ensure dotenv is available and configured in your project)
require('dotenv').config(); 

// 1. Configure the Nodemailer Transport
// This object uses your .env variables to connect to your SMTP server (e.g., Gmail)
const transporter = nodemailer.createTransport({
    // Use environment variables for host and port
    host: process.env.MAIL_SMTP_HOST, 
    port: process.env.MAIL_SMTP_PORT, 
    secure: process.env.MAIL_SMTP_SECURE === 'true', // Use SSL/TLS if true (recommended for 465)
    auth: {
        user: process.env.MAIL_SMTP_USER, // Your sender email address
        pass: process.env.MAIL_SMTP_PASS, // Your App Password
    },
});

// 2. Mail Sending Function (Real Implementation)
const sendMail = (to, subject, htmlContent) => {
    // Basic check to prevent crashes if config is missing
    if (!process.env.MAIL_SMTP_USER || !process.env.MAIL_SMTP_PASS || !process.env.MAIL_SENDER_EMAIL) {
        console.error('❌ EMAIL CONFIGURATION ERROR: Environment variables (MAIL_SMTP_USER/PASS/SENDER_EMAIL) are not fully set.');
        console.error('Using simulated log instead of sending real email.');
        // Fallback to simulation log
        console.log('-------------------------------------------');
        console.log(`MAIL LOG: Subject: ${subject} | To: ${to}`);
        console.log('-------------------------------------------');
        return;
    }

    const mailOptions = {
        from: process.env.MAIL_SENDER_EMAIL, // The 'From' address from your .env
        to: to,
        subject: subject,
        html: htmlContent,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('❌ Real Mail Send Error:', error.message);
            console.error('HINT: For Gmail, ensure 2FA is on and you are using a generated App Password for MAIL_SMTP_PASS.');
        } else {
            console.log('✅ Email sent successfully. Response:', info.response);
        }
    });
    // Removed the simulated Promise delay/return
};

// 3. Email Content Creation Function (Registration)
const createRegistrationMail = (fullName, studentId, rawPassword) => {
    // Improved HTML template for better readability in actual email clients
    return `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #003973; border-bottom: 2px solid #003973; padding-bottom: 10px;">VIIT Mock Portal Registration Successful!</h2>
            <p>Dear ${fullName},</p>
            <p>Congratulations! Your registration is successful. You can now log in to the student dashboard.</p>
            
            <p style="font-weight: bold;">Please use the following credentials:</p>
            
            <table style="border-collapse: collapse; width: 100%; margin: 15px 0;">
                <tr>
                    <td style="padding: 10px; background-color: #f4f4f4; border: 1px solid #ddd; width: 40%; font-weight: bold;">Login ID (Student ID):</td>
                    <td style="padding: 10px; border: 1px solid #ddd; width: 60%;">${studentId}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; background-color: #f4f4f4; border: 1px solid #ddd; font-weight: bold;">Temporary Password:</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${rawPassword}</td>
                </tr>
            </table>
            
            <p>Please log in and consider changing your password immediately for security purposes.</p>
            <p>Good luck with your exams!</p>
            <p style="margin-top: 20px; font-size: small; color: #777;">Thank you,<br>The VIIT Team</p>
        </div>
    `;
};

// 4. Email Content Creation Function (Results) - Your original logic is maintained
const createResultMail = (fullName, totalScore, totalMarks, analysis) => {
    let weaknessHtml = '';
    const weakSubjects = [];

    // Simple analysis logic: Flag subject if score is less than 50% of total subject marks
    for (const subject in analysis) {
        const data = analysis[subject];
        if (data.score < (data.total / 2)) {
            weakSubjects.push(subject);
            weaknessHtml += `<li><strong>${subject}:</strong> Your score of ${data.score}/${data.total} suggests a need for improvement. Focus on the fundamental concepts.</li>`;
        }
    }

    if (weakSubjects.length > 0) {
        weaknessHtml = `
            <div style="padding: 15px; border: 1px solid #ffcc00; background-color: #fffacd; margin-top: 20px;">
                <h2>Personalized Suggestion</h2>
                <p>Based on your performance, here are some subjects we recommend you focus on:</p>
                <ul style="padding-left: 20px;">${weaknessHtml}</ul>
                <p>A balanced preparation is key to success!</p>
            </div>
        `;
    } else {
        weaknessHtml = '<div style="padding: 15px; border: 1px solid #4CAF50; background-color: #e6ffe6; margin-top: 20px;"><h2>Congratulations!</h2><p>Your performance across all subjects was strong and balanced! Keep up the great work.</p></div>';
    }

    return `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
            <h1 style="color: #003973;">Mock Exam Results for ${fullName}</h1>
            <p>We are pleased to announce your results for the latest mock test.</p>
            <p><strong>Overall Score:</strong> <span style="font-size: 1.2em; color: #003973; font-weight: bold;">${totalScore} out of ${totalMarks}</span></p>
            
            <h2 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Subject Breakdown:</h2>
            <ul style="list-style-type: none; padding: 0;">
                <li style="margin-bottom: 5px;">Physics: <strong>${analysis.PHYSICS.score}/${analysis.PHYSICS.total}</strong></li>
                <li style="margin-bottom: 5px;">Chemistry: <strong>${analysis.CHEMISTRY.score}/${analysis.CHEMISTRY.total}</strong></li>
                <li style="margin-bottom: 5px;">Maths: <strong>${analysis.MATHS.score}/${analysis.MATHS.total}</strong></li>
            </ul>

            ${weaknessHtml}
            
            <p style="margin-top: 20px;">All the best for your continued preparation!</p>
        </div>
    `;
};


module.exports = {
    sendMail,
    createRegistrationMail,
    createResultMail
};