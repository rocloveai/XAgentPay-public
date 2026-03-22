-- Migration 012: Add skill_user_url column to merchant_registry
-- The application code references this column for HTTP REST API docs URL.

ALTER TABLE merchant_registry
  ADD COLUMN IF NOT EXISTS skill_user_url TEXT;
