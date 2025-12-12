// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

/**
 * Middleware to verify a JWT token and attach user info (id, role) to the request.
 */
const protect = (req, res, next) => {
    let token;

    // 1. Check for token in the 'Authorization' header
    // Format: "Bearer <TOKEN>"
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Extract the token part
            token = req.headers.authorization.split(' ')[1];

            // 2. Verify the token using the secret key
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // 3. Attach the decoded user payload to the request (req.user)
            // This payload contains { id: user.id, role: user.role }
            req.user = decoded; 

            next(); // Move to the next middleware or controller function
        } catch (error) {
            console.error('JWT Verification Error:', error.message);
            return res.status(401).json({ message: 'Not authorized, token failed or expired.' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided.' });
    }
};

/**
 * Middleware to restrict access based on user role.
 * Example: authorize('ADMIN', 'TEACHER')
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        // req.user is populated by the 'protect' middleware
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: `Forbidden: User role ${req.user.role} is not authorized to access this resource.` 
            });
        }
        next();
    };
};


module.exports = { protect, authorize };