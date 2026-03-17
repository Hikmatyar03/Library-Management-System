// routes/faculty.js — Faculty API Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// POST /api/faculty/register
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const {
            employee_id, full_name, email,
            department, designation, office_number, phone
        } = req.body;

        // Validation
        if (!employee_id || !full_name || !email || !department || !designation) {
            return res.status(400).json({ error: 'All required fields must be provided.' });
        }
        const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRx.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        // Check uniqueness
        const [existEmail] = await db.query('SELECT employee_id FROM faculty WHERE email = ?', [email]);
        if (existEmail.length) {
            return res.status(409).json({ error: 'This email is already registered.' });
        }
        const [existId] = await db.query('SELECT employee_id FROM faculty WHERE employee_id = ?', [employee_id]);
        if (existId.length) {
            return res.status(409).json({ error: 'This Employee ID is already in use.' });
        }

        // Insert with dummy password hash to satisfy DB constraint
        const password_hash = 'NO_PASS';
        await db.query(
            `INSERT INTO faculty (employee_id, full_name, email, password_hash, department, designation, office_number, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                employee_id, full_name.trim(), email.toLowerCase(), password_hash,
                department.trim(), designation.trim(),
                office_number || null, phone || null
            ]
        );

        res.status(201).json({ message: 'Registration successful! You can now log in.' });
    } catch (err) {
        console.error('Faculty register error:', err);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/faculty/login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { employee_id } = req.body;

        if (!employee_id) {
            return res.status(400).json({ error: 'Employee ID is required.' });
        }

        const [rows] = await db.query('SELECT * FROM faculty WHERE employee_id = ?', [employee_id]);
        if (!rows.length) {
            return res.status(400).json({ error: 'Employee ID not found in system.' });
        }

        const faculty = rows[0];

        res.json({
            message: 'Access granted',
            employee_id: faculty.employee_id,
            full_name: faculty.full_name
        });
    } catch (err) {
        console.error('Faculty login error:', err);
        res.status(500).json({ error: 'Access failed. Please try again.' });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/faculty/profile — Auth required
// ─────────────────────────────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
    try {
        if (req.user.role !== 'faculty') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const [rows] = await db.query(
            `SELECT employee_id, full_name, email, department, designation,
              office_number, phone, created_at, updated_at
       FROM faculty WHERE employee_id = ?`,
            [req.user.id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Faculty member not found.' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Faculty profile GET error:', err);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/faculty/profile — Auth required
// ─────────────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
    try {
        if (req.user.role !== 'faculty') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { phone, office_number, designation } = req.body;

        await db.query(
            `UPDATE faculty SET
         phone = COALESCE(NULLIF(?, ''), phone),
         office_number = COALESCE(NULLIF(?, ''), office_number),
         designation   = COALESCE(NULLIF(?, ''), designation)
       WHERE employee_id = ?`,
            [phone, office_number, designation, req.user.id]
        );

        const [rows] = await db.query(
            `SELECT employee_id, full_name, email, department, designation,
              office_number, phone, created_at, updated_at
       FROM faculty WHERE employee_id = ?`,
            [req.user.id]
        );

        res.json({ message: 'Profile updated successfully!', faculty: rows[0] });
    } catch (err) {
        console.error('Faculty profile PUT error:', err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/faculty/students — Paginated student list
// ─────────────────────────────────────────────────────────────
router.get('/students', auth, async (req, res) => {
    try {
        if (req.user.role !== 'faculty') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        const [rows] = await db.query(
            `SELECT student_id, full_name, program, enrollment_year, current_semester, gpa, email
       FROM students ORDER BY full_name ASC LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM students');

        res.json({
            students: rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Faculty students list error:', err);
        res.status(500).json({ error: 'Failed to fetch students.' });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/faculty/students/search?q=...
// ─────────────────────────────────────────────────────────────
router.get('/students/search', auth, async (req, res) => {
    try {
        if (req.user.role !== 'faculty') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const q = (req.query.q || '').trim();
        if (!q) {
            return res.status(400).json({ error: 'Search query is required.' });
        }

        const like = `%${q}%`;
        const [rows] = await db.query(
            `SELECT student_id, full_name, program, enrollment_year, current_semester, gpa, email
       FROM students
       WHERE full_name LIKE ? OR student_id LIKE ?
       ORDER BY full_name ASC LIMIT 50`,
            [like, like]
        );

        res.json({ students: rows, total: rows.length });
    } catch (err) {
        console.error('Faculty student search error:', err);
        res.status(500).json({ error: 'Search failed. Please try again.' });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/faculty/logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', auth, (req, res) => {
    res.json({ message: 'Logged out successfully.' });
});

module.exports = router;