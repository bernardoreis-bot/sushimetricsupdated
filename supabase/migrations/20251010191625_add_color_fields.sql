/*
  # Add Color Fields

  1. Changes
    - Add `color` column to `transaction_categories` table
    - Add `color` column to `suppliers` table
    - Add `color` column to `invoice_parsing_rules` table

  2. Notes
    - Colors will match dashboard colors (blue, orange, green, purple)
    - Defaults to blue
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transaction_categories' AND column_name = 'color'
  ) THEN
    ALTER TABLE transaction_categories ADD COLUMN color TEXT DEFAULT 'blue';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'color'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN color TEXT DEFAULT 'orange';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_parsing_rules' AND column_name = 'color'
  ) THEN
    ALTER TABLE invoice_parsing_rules ADD COLUMN color TEXT DEFAULT 'green';
  END IF;
END $$;
