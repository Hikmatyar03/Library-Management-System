// middleware/auth.js — JWT Verification Middleware
const jwt = require('jsonwebtoken');

/**
 * Protects routes by verifying the Bearer JWT token.
 * Attaches decoded user { id, role } to req.user.
 */
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role } — id is student_id or employee_id
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }
}

module.exports = verifyToken;
