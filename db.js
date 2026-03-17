// db.js - MySQL connection pool
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'portal_db';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [DB_NAME, tableName, columnName]
  );

  if (!rows.length) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensureCoreSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      book_id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      author VARCHAR(150) NOT NULL,
      category VARCHAR(100) NOT NULL,
      isbn VARCHAR(30) NOT NULL UNIQUE,
      publisher VARCHAR(150) NOT NULL,
      \`year\` INT NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      available INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_books_title (title),
      INDEX idx_books_author (author),
      INDEX idx_books_category (category)
    )
  `);

  await ensureColumn('faculty', 'is_librarian', 'TINYINT(1) NOT NULL DEFAULT 0');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_admins (
      admin_id VARCHAR(20) PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS book_requests (
      request_id INT AUTO_INCREMENT PRIMARY KEY,
      book_id INT NOT NULL,
      requester_role VARCHAR(20) NOT NULL,
      requester_id VARCHAR(20) NOT NULL,
      requester_name VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      request_note VARCHAR(255) NULL,
      admin_note VARCHAR(255) NULL,
      approved_by_admin_id VARCHAR(20) NULL,
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      decided_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_book_requests_book (book_id),
      INDEX idx_book_requests_requester (requester_role, requester_id),
      INDEX idx_book_requests_status (status),
      CONSTRAINT fk_book_requests_book
        FOREIGN KEY (book_id) REFERENCES books(book_id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(
    `
      INSERT INTO library_admins (admin_id, full_name, email, password_hash)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        email = VALUES(email)
    `,
    ['LIB-ADMIN-001', 'Library Admin', 'libraryadmin@uniportal.local', 'NO_PASS']
  );
}

pool.getConnection()
  .then(async (conn) => {
    console.log(`MySQL connected: ${DB_NAME}`);
    conn.release();
    await ensureCoreSchema();
    console.log('Library schema ready');
  })
  .catch((err) => {
    console.error('MySQL connection failed:', err.message);
    console.error('Update DB_PASS in your .env file with your MySQL password, then restart.');
    console.error('The frontend is still accessible even if the database is unavailable.');
  });

module.exports = pool;
