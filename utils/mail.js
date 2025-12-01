// This module simulates sending emails. In a real application, you would use a service 
// like Nodemailer, SendGrid, or AWS SES.

const sendMail = async (to, subject, htmlContent) => {
    // In a real app, you'd use a library like nodemailer here.
    
    console.log('-------------------------------------------');
    console.log(`MAIL SENT TO: ${to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log('-------------------------------------------');
    console.log('EMAIL BODY (HTML/TEXT):\n', htmlContent.substring(0, 500) + (htmlContent.length > 500 ? '...' : ''));
    console.log('-------------------------------------------');

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    return { success: true, message: 'Mail simulated successfully.' };
};

const createRegistrationMail = (fullName, studentId, rawPassword) => {
    return `
        <h1>Welcome to the VIIT Mock Portal, ${fullName}!</h1>
        <p>Your registration is successful. You can now log in to the student dashboard.</p>
        <p><strong>Your Login ID:</strong> ${studentId}</p>
        <p><strong>Your Temporary Password:</strong> ${rawPassword}</p>
        <p>Please log in and consider changing your password immediately.</p>
        <p>Good luck with your exams!</p>
    `;
};

/**
 * Creates a personalized result email for a student.
 * @param {string} fullName
 * @param {number} totalScore
 * @param {number} totalMarks
 * @param {object} analysis - Object like { PHYSICS: { score: 30, total: 40, weakAreas: [] }, ...}
 * @returns {string} HTML content
 */
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
            <h2>Personalized Suggestion</h2>
            <p>Based on your performance, here are some subjects we recommend you focus on:</p>
            <ul>${weaknessHtml}</ul>
            <p>A balanced preparation is key to success!</p>
        `;
    } else {
        weaknessHtml = '<h2>Congratulations!</h2><p>Your performance across all subjects was strong and balanced!</p>';
    }

    return `
        <h1>Mock Exam Results for ${fullName}</h1>
        <p>We are pleased to announce your results for the latest mock test.</p>
        <p><strong>Overall Score:</strong> ${totalScore} out of ${totalMarks}</p>
        
        <h2>Subject Breakdown:</h2>
        <ul>
            <li>Physics: ${analysis.PHYSICS.score}/${analysis.PHYSICS.total}</li>
            <li>Chemistry: ${analysis.CHEMISTRY.score}/${analysis.CHEMISTRY.total}</li>
            <li>Maths: ${analysis.MATHS.score}/${analysis.MATHS.total}</li>
        </ul>

        ${weaknessHtml}
        
        <p>All the best!</p>
    `;
};


module.exports = {
    sendMail,
    createRegistrationMail,
    createResultMail
};