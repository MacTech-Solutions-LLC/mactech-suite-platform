-- Add 'training' to the AppCategory enum.
-- Postgres 12+ allows ALTER TYPE ADD VALUE inside a transaction, but the
-- new value cannot be referenced until that transaction commits — so any
-- UPDATE that uses 'training' has to live in a separate migration.
ALTER TYPE "AppCategory" ADD VALUE IF NOT EXISTS 'training' BEFORE 'admin';
