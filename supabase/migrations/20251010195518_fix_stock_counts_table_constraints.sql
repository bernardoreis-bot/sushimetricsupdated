/*
  # Fix Stock Counts Table Constraints

  1. Changes
    - Make product_mapping_id NOT NULL (it's required)
    - Ensure proper foreign key constraint
    - Add default values where needed

  2. Notes
    - Every stock count must reference a product mapping
    - Cascading deletes to maintain referential integrity
*/

-- First, delete any rows with NULL product_mapping_id (there shouldn't be any yet)
DELETE FROM stock_counts WHERE product_mapping_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE stock_counts ALTER COLUMN product_mapping_id SET NOT NULL;

-- Ensure we have proper foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'stock_counts_product_mapping_id_fkey'
    AND table_name = 'stock_counts'
  ) THEN
    ALTER TABLE stock_counts 
    ADD CONSTRAINT stock_counts_product_mapping_id_fkey 
    FOREIGN KEY (product_mapping_id) 
    REFERENCES product_mappings(id) 
    ON DELETE CASCADE;
  END IF;
END $$;
