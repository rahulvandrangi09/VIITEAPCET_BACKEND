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

// 5. Email Content Creation Function (Results with Voucher) - For Top 10 Students
const createResultMailWithVoucher = (fullName, totalScore, totalMarks, analysis, voucherCode, rank) => {
    let weaknessHtml = '';
    const weakSubjects = [];

    // 1. Create a "Safe" analysis object with defaults
    const safeAnalysis = {
        PHYSICS: analysis?.PHYSICS || { score: 0, total: 0 },
        CHEMISTRY: analysis?.CHEMISTRY || { score: 0, total: 0 },
        MATHEMATICS: analysis?.MATHEMATICS || analysis?.MATHS || { score: 0, total: 0 }
    };

    // 2. Logic to build the improvement suggestions
    for (const subject in safeAnalysis) {
        const data = safeAnalysis[subject];
        if (data.total > 0 && data.score < (data.total / 2)) {
            weakSubjects.push(subject);
            weaknessHtml += `<li><strong>${subject}:</strong> Score: ${data.score}/${data.total}</li>`;
        }
    }

    const feedbackBox = weakSubjects.length > 0 
        ? `<div style="padding: 15px; border: 1px solid #ffcc00; background-color: #fffacd; margin-top: 20px;">
            <h3>Focus Areas</h3>
            <ul>${weaknessHtml}</ul>
           </div>`
        : `<div style="padding: 15px; border: 1px solid #4CAF50; background-color: #e6ffe6; margin-top: 20px;">
            <h3>Great Job!</h3><p>You performed well across all sections.</p>
           </div>`;

    return `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #003973;">🎉 Exam Results & Amazon Voucher!</h2>
            <p>Dear ${fullName},</p>
            <p>Congratulations! You ranked <strong>#${rank}</strong> in the exam!</p>
            
            <p><strong>Total Score:</strong> ${totalScore || 0} / ${totalMarks || 0}</p>
            
            <hr />
            <h3>Subject Breakdown:</h3>
            <p>Physics: ${safeAnalysis.PHYSICS.score}/${safeAnalysis.PHYSICS.total}</p>
            <p>Chemistry: ${safeAnalysis.CHEMISTRY.score}/${safeAnalysis.CHEMISTRY.total}</p>
            <p>Mathematics: ${safeAnalysis.MATHEMATICS.score}/${safeAnalysis.MATHEMATICS.total}</p>

            ${feedbackBox}

            <div style="padding: 20px; border: 2px solid #FF9900; background-color: #fff8e1; margin-top: 20px; border-radius: 8px; text-align: center;">
                <h3 style="color: #FF9900; margin-bottom: 10px;">🎁 Amazon Voucher Code</h3>
                <p style="font-size: 18px; font-weight: bold; color: #003973; margin: 10px 0;">${voucherCode}</p>
                <p style="font-size: 12px; color: #666;">Use this code to redeem your Amazon voucher!</p>
            </div>
            
            <p style="font-size: 12px; color: #777; margin-top: 30px;">Sent via VIIT Mock Portal</p>
        </div>
    `;
};

// 4. Email Content Creation Function (Results) - Your original logic is maintained
const createResultMail = (fullName, totalScore, totalMarks, analysis) => {
    let weaknessHtml = '';
    const weakSubjects = [];

    // 1. Create a "Safe" analysis object with defaults
    // This prevents "Cannot read property 'score' of undefined"
    const safeAnalysis = {
        PHYSICS: analysis?.PHYSICS || { score: 0, total: 0 },
        CHEMISTRY: analysis?.CHEMISTRY || { score: 0, total: 0 },
        MATHEMATICS: analysis?.MATHEMATICS || analysis?.MATHS || { score: 0, total: 0 }
    };

    // 2. Logic to build the improvement suggestions
    for (const subject in safeAnalysis) {
        const data = safeAnalysis[subject];
        // Only suggest improvement if they actually had questions (total > 0)
        if (data.total > 0 && data.score < (data.total / 2)) {
            weakSubjects.push(subject);
            weaknessHtml += `<li><strong>${subject}:</strong> Score: ${data.score}/${data.total}</li>`;
        }
    }

    const feedbackBox = weakSubjects.length > 0 
        ? `<div style="padding: 15px; border: 1px solid #ffcc00; background-color: #fffacd; margin-top: 20px;">
            <h3>Focus Areas</h3>
            <ul>${weaknessHtml}</ul>
           </div>`
        : `<div style="padding: 15px; border: 1px solid #4CAF50; background-color: #e6ffe6; margin-top: 20px;">
            <h3>Great Job!</h3><p>You performed well across all sections.</p>
           </div>`;

    return `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #003973;">Exam Results: ${fullName}</h2>
            <p><strong>Total Score:</strong> ${totalScore || 0} / ${totalMarks || 0}</p>
            
            <hr />
            <h3>Subject Breakdown:</h3>
            <p>Physics: ${safeAnalysis.PHYSICS.score}/${safeAnalysis.PHYSICS.total}</p>
            <p>Chemistry: ${safeAnalysis.CHEMISTRY.score}/${safeAnalysis.CHEMISTRY.total}</p>
            <p>Mathematics: ${safeAnalysis.MATHEMATICS.score}/${safeAnalysis.MATHEMATICS.total}</p>

            ${feedbackBox}
            
            <p style="font-size: 12px; color: #777; margin-top: 30px;">Sent via VIIT Mock Portal</p>
        </div>
    `;
};


module.exports = {
    sendMail,
    createRegistrationMail,
    createResultMail,
    createResultMailWithVoucher // 🚨 NEW EXPORT
};