// db.js — MySQL connection pool
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'portal_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

// Validate connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅  MySQL connected: portal_db');
    conn.release();
  })
  .catch(err => {
    console.error('⚠️   MySQL connection failed:', err.message);
    console.error('   → Update DB_PASS in your .env file with your MySQL password, then restart.');
    console.error('   → The frontend is still accessible at http://localhost:3000');
    // Don't exit — let the server serve static files even without DB
  });

module.exports = pool;
