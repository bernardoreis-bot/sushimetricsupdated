/*
  # Add Unit Price and Counter Fields

  1. Changes to Tables
    - Add `unit_price` column to `product_mappings` table
      - Type: numeric with 2 decimal places
      - Default: 0.00
      - For tracking individual item costs
    
    - Add `counted_by` column to `stock_counts` table
      - Type: text
      - Nullable: true
      - For tracking who performed the stock count
  
  2. Notes
    - Unit price will be used to calculate stock values
    - Counted by field will appear in history and PDF exports
    - Uses IF NOT EXISTS to prevent errors on re-runs
*/

-- Add unit_price to product_mappings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_mappings' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE product_mappings ADD COLUMN unit_price numeric(10,2) DEFAULT 0.00;
  END IF;
END $$;

-- Add counted_by to stock_counts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_counts' AND column_name = 'counted_by'
  ) THEN
    ALTER TABLE stock_counts ADD COLUMN counted_by text;
  END IF;
END $$;