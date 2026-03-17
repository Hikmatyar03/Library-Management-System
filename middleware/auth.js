// middleware/auth.js — Authentication Helper
// Validates session via simple headers instead of JWT

/**
 * Protects routes by checking the X-User-Id header.
 * Attaches user { id, role } to req.user.
 */
function verifySession(req, res, next) {
    const userId = req.headers['x-user-id'];
    const role = req.headers['x-user-role'];

    if (!userId || !role) {
        return res.status(401).json({ error: 'Access denied. Session invalid.' });
    }

    req.user = { id: userId, role: role };
    next();
}

module.exports = verifySession;
