const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

function ensureBorrower(req, res, next) {
  if (!['student', 'faculty'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only students and faculty can request books.' });
  }

  next();
}

function parseBookId(value) {
  const bookId = Number.parseInt(value, 10);
  return Number.isInteger(bookId) && bookId > 0 ? bookId : null;
}

async function getRequester(connection, role, id) {
  if (role === 'student') {
    const [rows] = await connection.query(
      'SELECT student_id AS id, full_name FROM students WHERE student_id = ?',
      [id]
    );
    return rows[0] || null;
  }

  if (role === 'faculty') {
    const [rows] = await connection.query(
      'SELECT employee_id AS id, full_name FROM faculty WHERE employee_id = ?',
      [id]
    );
    return rows[0] || null;
  }

  return null;
}

router.use(auth);

router.get('/requests/mine', ensureBorrower, async (req, res) => {
  try {
    const [rows] = await db.query(
      `
        SELECT
          br.request_id,
          br.book_id,
          br.status,
          br.request_note,
          br.admin_note,
          br.requested_at,
          br.decided_at,
          b.title,
          b.author,
          b.category,
          b.isbn
        FROM book_requests br
        JOIN books b ON b.book_id = br.book_id
        WHERE br.requester_role = ? AND br.requester_id = ?
        ORDER BY br.requested_at DESC
      `,
      [req.user.role, req.user.id]
    );

    res.json({ requests: rows });
  } catch (err) {
    console.error('My requests error:', err);
    res.status(500).json({ error: 'Failed to fetch your book requests.' });
  }
});

router.post('/requests', ensureBorrower, async (req, res) => {
  const bookId = parseBookId(req.body.book_id);
  const requestNote = String(req.body.request_note || '').trim() || null;

  if (!bookId) {
    return res.status(400).json({ error: 'Valid book ID is required.' });
  }

  const connection = await db.getConnection();

  try {
    const requester = await getRequester(connection, req.user.role, req.user.id);
    if (!requester) {
      return res.status(404).json({ error: 'Requester profile not found.' });
    }

    const [bookRows] = await connection.query(
      'SELECT book_id, title, available FROM books WHERE book_id = ?',
      [bookId]
    );
    if (!bookRows.length) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    if (bookRows[0].available <= 0) {
      return res.status(409).json({ error: 'This book is currently unavailable.' });
    }

    const [existingRows] = await connection.query(
      `
        SELECT request_id
        FROM book_requests
        WHERE book_id = ?
          AND requester_role = ?
          AND requester_id = ?
          AND status IN ('pending', 'approved')
        LIMIT 1
      `,
      [bookId, req.user.role, req.user.id]
    );

    if (existingRows.length) {
      return res.status(409).json({ error: 'You already have an active request for this book.' });
    }

    const [result] = await connection.query(
      `
        INSERT INTO book_requests (
          book_id,
          requester_role,
          requester_id,
          requester_name,
          request_note
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [bookId, req.user.role, req.user.id, requester.full_name, requestNote]
    );

    const [[request]] = await connection.query(
      `
        SELECT
          br.request_id,
          br.book_id,
          br.status,
          br.request_note,
          br.requested_at,
          b.title,
          b.author,
          b.category,
          b.isbn
        FROM book_requests br
        JOIN books b ON b.book_id = br.book_id
        WHERE br.request_id = ?
      `,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Book request submitted for library admin approval.',
      request,
    });
  } catch (err) {
    console.error('Book request error:', err);
    res.status(500).json({ error: 'Failed to submit book request.' });
  } finally {
    connection.release();
  }
});

module.exports = router;
