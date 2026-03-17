// server.js - Express Application Entry Point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/students', require('./routes/students'));
app.use('/api/faculty', require('./routes/faculty'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/books', require('./routes/books'));
app.use('/api/library', require('./routes/library'));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
    return;
  }

  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const START_PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const MAX_PORT_ATTEMPTS = 20;

function startServer(port, attempt = 0) {
  const server = app.listen(port);

  server.once('listening', () => {
    console.log(`Portal server running at http://localhost:${port}`);
  });

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use. Trying port ${nextPort}...`);
      startServer(nextPort, attempt + 1);
      return;
    }

    console.error(`Failed to start server on port ${port}:`, err.message);
    process.exit(1);
  });
}

startServer(START_PORT);
