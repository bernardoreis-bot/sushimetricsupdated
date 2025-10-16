/*
  # Add Invoice File Storage to Transactions

  1. Changes
    - Add `invoice_file_name` column to store original filename
    - Add `invoice_file_path` column to store file path/URL
    - Add `invoice_file_size` column to store file size in bytes
    - Add `invoice_uploaded_at` column to track upload time
    - Add `invoice_text_content` column to store extracted text for searching

  2. Notes
    - Enables storing invoice PDFs with transactions
    - Text content allows searching and analysis without re-parsing
    - File metadata helps with management and UI display
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'invoice_file_name'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_file_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'invoice_file_path'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_file_path TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'invoice_file_size'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_file_size INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'invoice_uploaded_at'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_uploaded_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'invoice_text_content'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_text_content TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_invoice_file_path ON transactions(invoice_file_path);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_text_content ON transactions USING gin(to_tsvector('english', invoice_text_content));
