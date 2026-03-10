-- ============================================================
-- Student & Faculty Portal System — Database Schema
-- Run this in MySQL before starting the server
-- Usage: mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS portal_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE portal_db;

-- Students Table
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

-- Faculty Table
CREATE TABLE IF NOT EXISTS faculty (
  employee_id    VARCHAR(20)    PRIMARY KEY,
  full_name      VARCHAR(100)   NOT NULL,
  email          VARCHAR(150)   UNIQUE NOT NULL,
  password_hash  VARCHAR(255)   NOT NULL,
  department     VARCHAR(100)   NOT NULL,
  designation    VARCHAR(100)   NOT NULL,
  office_number  VARCHAR(20),
  phone          VARCHAR(20),
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexes for performance (SRD §7 — Non-Functional Requirements)
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_faculty_email ON faculty(email);

SELECT 'Schema created successfully!' AS status;
