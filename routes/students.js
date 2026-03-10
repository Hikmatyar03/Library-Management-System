// routes/students.js — Student API Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// POST /api/students/register
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const {
            student_id, full_name, email, password,
            program, enrollment_year, phone
        } = req.body;

        // Validation
        if (!student_id || !full_name || !email || !password || !program || !enrollment_year) {
            return res.status(400).json({ error: 'All required fields must be provided.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }
        const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRx.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        // Check uniqueness
        const [existEmail] = await db.query('SELECT student_id FROM students WHERE email = ?', [email]);
        if (existEmail.length) {
            return res.status(409).json({ error: 'This email is already registered.' });
        }
        const [existId] = await db.query('SELECT student_id FROM students WHERE student_id = ?', [student_id]);
        if (existId.length) {
            return res.status(409).json({ error: 'This Student ID is already in use.' });
        }

        // Hash password & insert
        const password_hash = await bcrypt.hash(password, 10);
        await db.query(
            `INSERT INTO students (student_id, full_name, email, password_hash, program, enrollment_year, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [student_id, full_name.trim(), email.toLowerCase(), password_hash, program.trim(), enrollment_year, phone || null]
        );

        res.status(201).json({ message: 'Registration successful! You can now log in.' });
    } catch (err) {
        console.error('Student register error:', err);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/students/login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const [rows] = await db.query('SELECT * FROM students WHERE email = ?', [email.toLowerCase()]);
        if (!rows.length) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        const student = rows[0];
        const valid = await bcrypt.compare(password, student.password_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: student.student_id, role: 'student' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            student_id: student.student_id,
            full_name: student.full_name
        });
    } catch (err) {
        console.error('Student login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/students/profile — Auth required
// ─────────────────────────────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const [rows] = await db.query(
            `SELECT student_id, full_name, email, program, enrollment_year,
              current_semester, gpa, phone, created_at, updated_at
       FROM students WHERE student_id = ?`,
            [req.user.id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Student not found.' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Student profile GET error:', err);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/students/profile — Auth required
// ─────────────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { phone, program, current_semester, gpa } = req.body;

        // Validate GPA if provided
        if (gpa !== undefined && gpa !== '') {
            const gpaNum = parseFloat(gpa);
            if (isNaN(gpaNum) || gpaNum < 0 || gpaNum > 4.0) {
                return res.status(400).json({ error: 'GPA must be between 0.00 and 4.00.' });
            }
        }
        // Validate semester if provided
        if (current_semester !== undefined && current_semester !== '') {
            const sem = parseInt(current_semester);
            if (isNaN(sem) || sem < 1 || sem > 8) {
                return res.status(400).json({ error: 'Current semester must be between 1 and 8.' });
            }
        }

        await db.query(
            `UPDATE students SET
         phone = COALESCE(NULLIF(?, ''), phone),
         program = COALESCE(NULLIF(?, ''), program),
         current_semester = COALESCE(NULLIF(?, ''), current_semester),
         gpa = COALESCE(NULLIF(?, ''), gpa)
       WHERE student_id = ?`,
            [phone, program, current_semester, gpa, req.user.id]
        );

        // Return updated profile
        const [rows] = await db.query(
            `SELECT student_id, full_name, email, program, enrollment_year,
              current_semester, gpa, phone, created_at, updated_at
       FROM students WHERE student_id = ?`,
            [req.user.id]
        );

        res.json({ message: 'Profile updated successfully!', student: rows[0] });
    } catch (err) {
        console.error('Student profile PUT error:', err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/students/logout — Stateless (client clears token)
// ─────────────────────────────────────────────────────────────
router.post('/logout', auth, (req, res) => {
    res.json({ message: 'Logged out successfully.' });
});

module.exports = router;