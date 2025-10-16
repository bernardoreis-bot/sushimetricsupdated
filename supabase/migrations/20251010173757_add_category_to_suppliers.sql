/*
  # Add Category to Suppliers

  1. Changes
    - Add `default_category_id` column to `suppliers` table
    - This links suppliers to their default transaction category (e.g., Eden Farm -> Food COGS)
    - When parsing invoices, the system can auto-select the category based on the supplier
  
  2. Notes
    - The column is nullable to allow suppliers without a default category
    - Foreign key references `transaction_categories` table
*/

-- Add default_category_id to suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers' AND column_name = 'default_category_id'
  ) THEN
    ALTER TABLE suppliers 
    ADD COLUMN default_category_id UUID REFERENCES transaction_categories(id);
  END IF;
END $$;
