-- ============================================================
-- Student, Faculty, and Library Portal System - Database Schema
-- Run this in MySQL before starting the server
-- Usage: mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS portal_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE portal_db;

CREATE TABLE IF NOT EXISTS students (
  student_id        VARCHAR(20)    PRIMARY KEY,
  full_name         VARCHAR(100)   NOT NULL,
  email             VARCHAR(150)   UNIQUE NOT NULL,
  password_hash     VARCHAR(255)   NOT NULL,
  program           VARCHAR(100)   NOT NULL,
  enrollment_year   YEAR           NOT NULL,
  current_semester  INT            DEFAULT 1,
  gpa               DECIMAL(3,2)   DEFAULT 0.00,
  phone             VARCHAR(20),
  created_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faculty (
  employee_id    VARCHAR(20)    PRIMARY KEY,
  full_name      VARCHAR(100)   NOT NULL,
  email          VARCHAR(150)   UNIQUE NOT NULL,
  password_hash  VARCHAR(255)   NOT NULL,
  department     VARCHAR(100)   NOT NULL,
  designation    VARCHAR(100)   NOT NULL,
  is_librarian   TINYINT(1)     NOT NULL DEFAULT 0,
  office_number  VARCHAR(20),
  phone          VARCHAR(20),
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS library_admins (
  admin_id       VARCHAR(20)    PRIMARY KEY,
  full_name      VARCHAR(100)   NOT NULL,
  email          VARCHAR(150)   UNIQUE NOT NULL,
  password_hash  VARCHAR(255)   NOT NULL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS books (
  book_id        INT            AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(200)   NOT NULL,
  author         VARCHAR(150)   NOT NULL,
  category       VARCHAR(100)   NOT NULL,
  isbn           VARCHAR(30)    NOT NULL UNIQUE,
  publisher      VARCHAR(150)   NOT NULL,
  `year`         INT            NOT NULL,
  quantity       INT            NOT NULL DEFAULT 0,
  available      INT            NOT NULL DEFAULT 0,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_books_title (title),
  INDEX idx_books_author (author),
  INDEX idx_books_category (category)
);

CREATE TABLE IF NOT EXISTS book_requests (
  request_id             INT            AUTO_INCREMENT PRIMARY KEY,
  book_id                INT            NOT NULL,
  requester_role         VARCHAR(20)    NOT NULL,
  requester_id           VARCHAR(20)    NOT NULL,
  requester_name         VARCHAR(100)   NOT NULL,
  status                 VARCHAR(20)    NOT NULL DEFAULT 'pending',
  request_note           VARCHAR(255),
  admin_note             VARCHAR(255),
  approved_by_admin_id   VARCHAR(20),
  requested_at           TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  decided_at             TIMESTAMP      NULL DEFAULT NULL,
  INDEX idx_book_requests_book (book_id),
  INDEX idx_book_requests_requester (requester_role, requester_id),
  INDEX idx_book_requests_status (status),
  CONSTRAINT fk_book_requests_book
    FOREIGN KEY (book_id) REFERENCES books(book_id)
    ON DELETE CASCADE
);

INSERT INTO library_admins (admin_id, full_name, email, password_hash)
VALUES ('LIB-ADMIN-001', 'Library Admin', 'libraryadmin@uniportal.local', 'NO_PASS')
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  email = VALUES(email);

SELECT 'Schema created successfully!' AS status;
