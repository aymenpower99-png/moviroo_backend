/*
  Migration: add soft-delete columns to users and drivers tables
  Run this against your PostgreSQL database if the deleted_at column is missing.

  psql -U your_db_user -d your_db_name -f add_soft_delete_columns.sql
*/

-- Add deleted_at to users table (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE users ADD COLUMN deleted_at timestamptz NULL;
  END IF;
END
$$;

-- Add deleted_at to drivers table (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drivers' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE drivers ADD COLUMN deleted_at timestamptz NULL;
  END IF;
END
$$;
