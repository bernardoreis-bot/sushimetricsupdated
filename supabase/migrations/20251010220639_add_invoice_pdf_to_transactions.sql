/*
  # Add Invoice PDF Storage to Transactions

  1. Changes to Tables
    - Add `invoice_pdf` column to `transactions` table
      - Type: text
      - Nullable: true
      - For storing invoice PDF as base64 data URL
  
  2. Notes
    - invoice_pdf will store the uploaded invoice for download later
    - Uses IF NOT EXISTS to prevent errors on re-runs
*/

-- Add invoice_pdf for storing PDFs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'invoice_pdf'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_pdf text;
  END IF;
END $$;