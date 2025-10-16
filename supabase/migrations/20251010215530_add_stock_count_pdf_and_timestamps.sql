/*
  # Add PDF Storage and Timestamps to Stock Counts

  1. Changes to Tables
    - Add `created_at` column to `stock_counts` table
      - Type: timestamptz
      - Default: now()
      - For tracking when count was saved
    
    - Add `pdf_data` column to `stock_counts` table
      - Type: text
      - Nullable: true
      - For storing PDF as base64 or data URL
      - Will store one PDF per count date/site combination
  
  2. Notes
    - created_at will show exact time count was saved
    - pdf_data will store generated PDF for later download
    - Uses IF NOT EXISTS to prevent errors on re-runs
*/

-- Add created_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_counts' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE stock_counts ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Add pdf_data for storing PDFs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_counts' AND column_name = 'pdf_data'
  ) THEN
    ALTER TABLE stock_counts ADD COLUMN pdf_data text;
  END IF;
END $$;