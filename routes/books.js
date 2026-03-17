const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const SORT_FIELDS = {
  title: 'title',
  author: 'author',
};

function ensureKnownRole(req, res, next) {
  if (!['student', 'faculty', 'library_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  next();
}

function ensureLibraryAdmin(req, res, next) {
  if (req.user.role !== 'library_admin') {
    return res.status(403).json({ error: 'Only the library admin can manage books.' });
  }

  next();
}

function parseBookId(value) {
  const bookId = Number.parseInt(value, 10);
  return Number.isInteger(bookId) && bookId > 0 ? bookId : null;
}

function normalizeBookPayload(body = {}) {
  const currentYear = new Date().getFullYear() + 1;
  const title = String(body.title || '').trim();
  const author = String(body.author || '').trim();
  const category = String(body.category || '').trim();
  const isbn = String(body.isbn || '').trim();
  const publisher = String(body.publisher || '').trim();
  const year = Number.parseInt(body.year, 10);
  const quantity = Number.parseInt(body.quantity, 10);

  if (!title || !author || !category || !isbn || !publisher || Number.isNaN(year) || Number.isNaN(quantity)) {
    return { error: 'All book fields are required.' };
  }

  if (year < 1000 || year > currentYear) {
    return { error: `Publication year must be between 1000 and ${currentYear}.` };
  }

  if (quantity < 0) {
    return { error: 'Quantity cannot be negative.' };
  }

  return {
    data: { title, author, category, isbn, publisher, year, quantity },
  };
}

router.use(auth, ensureKnownRole);

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(25, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const sortBy = SORT_FIELDS[req.query.sortBy] || 'title';
    const sortDir = String(req.query.sortDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const whereParts = [];
    const params = [];

    if (search) {
      const like = `%${search}%`;
      whereParts.push('(title LIKE ? OR author LIKE ? OR category LIKE ? OR isbn LIKE ?)');
      params.push(like, like, like, like);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const listParams = [...params, limit, offset];

    const [books] = await db.query(
      `
        SELECT
          book_id,
          title,
          author,
          category,
          isbn,
          publisher,
          \`year\` AS year,
          quantity,
          available,
          created_at,
          updated_at
        FROM books
        ${whereSql}
        ORDER BY ${sortBy} ${sortDir}, book_id DESC
        LIMIT ? OFFSET ?
      `,
      listParams
    );

    const [[summary]] = await db.query(
      `
        SELECT
          COUNT(*) AS totalBooks,
          COALESCE(SUM(quantity), 0) AS totalCopies,
          COALESCE(SUM(available), 0) AS availableCopies,
          COUNT(DISTINCT category) AS totalCategories
        FROM books
        ${whereSql}
      `,
      params
    );

    res.json({
      books,
      summary,
      pagination: {
        page,
        limit,
        total: summary.totalBooks,
        totalPages: summary.totalBooks === 0 ? 0 : Math.ceil(summary.totalBooks / limit),
      },
      filters: {
        search,
        sortBy,
        sortDir,
      },
    });
  } catch (err) {
    console.error('Books list error:', err);
    res.status(500).json({ error: 'Failed to fetch books.' });
  }
});

router.post('/', ensureLibraryAdmin, async (req, res) => {
  try {
    const payload = normalizeBookPayload(req.body);
    if (payload.error) {
      return res.status(400).json({ error: payload.error });
    }

    const { title, author, category, isbn, publisher, year, quantity } = payload.data;
    const [existing] = await db.query('SELECT book_id FROM books WHERE isbn = ?', [isbn]);
    if (existing.length) {
      return res.status(409).json({ error: 'A book with this ISBN already exists.' });
    }

    const [result] = await db.query(
      `
        INSERT INTO books (title, author, category, isbn, publisher, \`year\`, quantity, available)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [title, author, category, isbn, publisher, year, quantity, quantity]
    );

    const [[book]] = await db.query(
      `
        SELECT
          book_id,
          title,
          author,
          category,
          isbn,
          publisher,
          \`year\` AS year,
          quantity,
          available,
          created_at,
          updated_at
        FROM books
        WHERE book_id = ?
      `,
      [result.insertId]
    );

    res.status(201).json({ message: 'Book added successfully.', book });
  } catch (err) {
    console.error('Book create error:', err);
    res.status(500).json({ error: 'Failed to add book.' });
  }
});

router.put('/:bookId', ensureLibraryAdmin, async (req, res) => {
  try {
    const bookId = parseBookId(req.params.bookId);
    if (!bookId) {
      return res.status(400).json({ error: 'Valid book ID is required.' });
    }

    const payload = normalizeBookPayload(req.body);
    if (payload.error) {
      return res.status(400).json({ error: payload.error });
    }

    const [existingRows] = await db.query(
      'SELECT book_id, quantity, available FROM books WHERE book_id = ?',
      [bookId]
    );
    if (!existingRows.length) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    const existing = existingRows[0];
    const { title, author, category, isbn, publisher, year, quantity } = payload.data;

    const [isbnConflict] = await db.query(
      'SELECT book_id FROM books WHERE isbn = ? AND book_id <> ?',
      [isbn, bookId]
    );
    if (isbnConflict.length) {
      return res.status(409).json({ error: 'A different book already uses this ISBN.' });
    }

    const checkedOutCopies = Math.max(0, existing.quantity - existing.available);
    const nextAvailable = Math.max(0, quantity - checkedOutCopies);

    await db.query(
      `
        UPDATE books
        SET
          title = ?,
          author = ?,
          category = ?,
          isbn = ?,
          publisher = ?,
          \`year\` = ?,
          quantity = ?,
          available = ?
        WHERE book_id = ?
      `,
      [title, author, category, isbn, publisher, year, quantity, nextAvailable, bookId]
    );

    const [[book]] = await db.query(
      `
        SELECT
          book_id,
          title,
          author,
          category,
          isbn,
          publisher,
          \`year\` AS year,
          quantity,
          available,
          created_at,
          updated_at
        FROM books
        WHERE book_id = ?
      `,
      [bookId]
    );

    res.json({ message: 'Book updated successfully.', book });
  } catch (err) {
    console.error('Book update error:', err);
    res.status(500).json({ error: 'Failed to update book.' });
  }
});

router.delete('/:bookId', ensureLibraryAdmin, async (req, res) => {
  try {
    const bookId = parseBookId(req.params.bookId);
    if (!bookId) {
      return res.status(400).json({ error: 'Valid book ID is required.' });
    }

    const [result] = await db.query('DELETE FROM books WHERE book_id = ?', [bookId]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    res.json({ message: 'Book deleted successfully.' });
  } catch (err) {
    console.error('Book delete error:', err);
    res.status(500).json({ error: 'Failed to delete book.' });
  }
});

module.exports = router;
