/*
  # Add Reference Pattern to Invoice Parsing Rules

  1. Changes
    - Add `reference_pattern` column to `invoice_parsing_rules` table
    - This allows users to specify custom regex patterns for extracting invoice references/order numbers

  2. Notes
    - Existing rules will have NULL reference_pattern and will use default patterns
    - Users can now customize how references like "Your Order No." are extracted
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_parsing_rules' AND column_name = 'reference_pattern'
  ) THEN
    ALTER TABLE invoice_parsing_rules ADD COLUMN reference_pattern TEXT;
  END IF;
END $$;
