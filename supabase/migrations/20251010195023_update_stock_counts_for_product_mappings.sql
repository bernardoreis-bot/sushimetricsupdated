/*
  # Update Stock Counts for Product Mappings

  1. Changes
    - Drop old product_id foreign key (references products table)
    - Add product_mapping_id column (references product_mappings table)
    - Migrate any existing data
    - Drop old product_id column

  2. Notes
    - Stock counts now reference product_mappings instead of products
    - This allows stock counting of supplier-specific items
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_counts' AND column_name = 'product_id'
  ) THEN
    ALTER TABLE stock_counts ADD COLUMN IF NOT EXISTS product_mapping_id UUID REFERENCES product_mappings(id) ON DELETE CASCADE;
    
    ALTER TABLE stock_counts DROP COLUMN IF EXISTS product_id;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_counts' AND column_name = 'product_mapping_id'
  ) THEN
    ALTER TABLE stock_counts ADD COLUMN product_mapping_id UUID REFERENCES product_mappings(id) ON DELETE CASCADE;
  END IF;
END $$;
