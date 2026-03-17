const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

function ensureLibraryAdmin(req, res, next) {
  if (req.user.role !== 'library_admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  next();
}

function parseRequestId(value) {
  const requestId = Number.parseInt(value, 10);
  return Number.isInteger(requestId) && requestId > 0 ? requestId : null;
}

router.post('/login', async (req, res) => {
  try {
    const adminId = String(req.body.admin_id || '').trim();
    if (!adminId) {
      return res.status(400).json({ error: 'Admin ID is required.' });
    }

    const [rows] = await db.query(
      'SELECT admin_id, full_name, email, created_at, updated_at FROM library_admins WHERE admin_id = ?',
      [adminId]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Library admin ID not found.' });
    }

    res.json({
      message: 'Access granted',
      admin_id: rows[0].admin_id,
      full_name: rows[0].full_name,
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Admin login failed.' });
  }
});

router.use(auth, ensureLibraryAdmin);

router.get('/profile', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT admin_id, full_name, email, created_at, updated_at FROM library_admins WHERE admin_id = ?',
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Library admin not found.' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Admin profile error:', err);
    res.status(500).json({ error: 'Failed to fetch admin profile.' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const [[booksSummary]] = await db.query(
      `
        SELECT
          COUNT(*) AS totalBooks,
          COALESCE(SUM(quantity), 0) AS totalCopies,
          COALESCE(SUM(available), 0) AS availableCopies
        FROM books
      `
    );
    const [[requestSummary]] = await db.query(
      `
        SELECT
          SUM(status = 'pending') AS pendingRequests,
          SUM(status = 'approved') AS approvedRequests,
          SUM(status = 'rejected') AS rejectedRequests
        FROM book_requests
      `
    );
    const [[librarianSummary]] = await db.query(
      'SELECT COUNT(*) AS totalLibrarians FROM faculty WHERE is_librarian = 1'
    );

    res.json({
      ...booksSummary,
      pendingRequests: requestSummary.pendingRequests || 0,
      approvedRequests: requestSummary.approvedRequests || 0,
      rejectedRequests: requestSummary.rejectedRequests || 0,
      totalLibrarians: librarianSummary.totalLibrarians || 0,
    });
  } catch (err) {
    console.error('Admin summary error:', err);
    res.status(500).json({ error: 'Failed to fetch admin summary.' });
  }
});

router.get('/faculty', async (req, res) => {
  try {
    const [rows] = await db.query(
      `
        SELECT
          employee_id,
          full_name,
          email,
          department,
          designation,
          is_librarian
        FROM faculty
        ORDER BY full_name ASC
      `
    );

    res.json({ faculty: rows });
  } catch (err) {
    console.error('Admin faculty list error:', err);
    res.status(500).json({ error: 'Failed to fetch faculty list.' });
  }
});

router.patch('/faculty/:employeeId/librarian', async (req, res) => {
  try {
    const employeeId = String(req.params.employeeId || '').trim();
    const isLibrarian = req.body.is_librarian ? 1 : 0;

    const [result] = await db.query(
      'UPDATE faculty SET is_librarian = ? WHERE employee_id = ?',
      [isLibrarian, employeeId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Faculty member not found.' });
    }

    const [[faculty]] = await db.query(
      `
        SELECT
          employee_id,
          full_name,
          email,
          department,
          designation,
          is_librarian
        FROM faculty
        WHERE employee_id = ?
      `,
      [employeeId]
    );

    res.json({
      message: isLibrarian ? 'Faculty member assigned as librarian.' : 'Librarian assignment removed.',
      faculty,
    });
  } catch (err) {
    console.error('Admin librarian assignment error:', err);
    res.status(500).json({ error: 'Failed to update librarian assignment.' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const requestedStatus = String(req.query.status || 'all').trim().toLowerCase();
    const allowedStatuses = new Set(['all', 'pending', 'approved', 'rejected']);
    const status = allowedStatuses.has(requestedStatus) ? requestedStatus : 'all';

    const params = [];
    const whereSql = status === 'all' ? '' : 'WHERE br.status = ?';
    if (status !== 'all') {
      params.push(status);
    }

    const [rows] = await db.query(
      `
        SELECT
          br.request_id,
          br.book_id,
          br.requester_role,
          br.requester_id,
          br.requester_name,
          br.status,
          br.request_note,
          br.admin_note,
          br.approved_by_admin_id,
          br.requested_at,
          br.decided_at,
          b.title,
          b.author,
          b.isbn,
          b.available
        FROM book_requests br
        JOIN books b ON b.book_id = br.book_id
        ${whereSql}
        ORDER BY
          CASE br.status
            WHEN 'pending' THEN 1
            WHEN 'approved' THEN 2
            ELSE 3
          END,
          br.requested_at DESC
      `,
      params
    );

    res.json({ requests: rows, status });
  } catch (err) {
    console.error('Admin requests error:', err);
    res.status(500).json({ error: 'Failed to fetch book requests.' });
  }
});

router.patch('/requests/:requestId', async (req, res) => {
  const requestId = parseRequestId(req.params.requestId);
  const action = String(req.body.action || '').trim().toLowerCase();
  const adminNote = String(req.body.admin_note || '').trim() || null;

  if (!requestId) {
    return res.status(400).json({ error: 'Valid request ID is required.' });
  }

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be either approve or reject.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
        SELECT
          br.request_id,
          br.book_id,
          br.status,
          b.available,
          b.title
        FROM book_requests br
        JOIN books b ON b.book_id = br.book_id
        WHERE br.request_id = ?
        FOR UPDATE
      `,
      [requestId]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Book request not found.' });
    }

    const request = rows[0];
    if (request.status !== 'pending') {
      await connection.rollback();
      return res.status(409).json({ error: 'This request has already been processed.' });
    }

    const nextStatus = action === 'approve' ? 'approved' : 'rejected';

    if (nextStatus === 'approved') {
      if (request.available <= 0) {
        await connection.rollback();
        return res.status(409).json({ error: 'No available copies remain for this book.' });
      }

      await connection.query(
        'UPDATE books SET available = available - 1 WHERE book_id = ?',
        [request.book_id]
      );
    }

    await connection.query(
      `
        UPDATE book_requests
        SET
          status = ?,
          admin_note = ?,
          approved_by_admin_id = ?,
          decided_at = CURRENT_TIMESTAMP
        WHERE request_id = ?
      `,
      [nextStatus, adminNote, req.user.id, requestId]
    );

    await connection.commit();

    res.json({
      message: nextStatus === 'approved'
        ? 'Book request approved successfully.'
        : 'Book request rejected successfully.',
    });
  } catch (err) {
    await connection.rollback();
    console.error('Admin request update error:', err);
    res.status(500).json({ error: 'Failed to update book request.' });
  } finally {
    connection.release();
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

module.exports = router;
