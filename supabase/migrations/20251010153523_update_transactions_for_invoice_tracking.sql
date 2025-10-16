/*
  # Update Transactions for Invoice-Based Tracking

  ## Summary
  Updates the transactions table to support invoice-based tracking with dynamic categories
  from the transaction_categories table.

  ## Changes Made
  
  ### 1. Add New Columns to transactions table
  - `category_id` (uuid, foreign key to transaction_categories) - Replaces old category text field
  - `invoice_number` (text) - Invoice number for the transaction
  - `invoice_reference` (text) - Additional reference like PO number
  
  ### 2. Data Migration
  - Create a temporary mapping of old categories to new category IDs
  - Migrate existing transaction data from 'category' to 'category_id'
  - Map 'labor' -> 'LABOUR', 'food_cost' -> 'COGS', 'sales' -> 'SALES'
  
  ### 3. Remove Old Fields
  - Drop old 'category' text column after migration
  - Remove item_name, quantity, unit_price (no longer needed for invoice-based tracking)
  
  ### 4. Update Indexes
  - Replace category index with category_id index
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE transactions ADD COLUMN category_id uuid REFERENCES transaction_categories(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'invoice_number'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'invoice_reference'
  ) THEN
    ALTER TABLE transactions ADD COLUMN invoice_reference text;
  END IF;
END $$;

DO $$
DECLARE
  sales_id uuid;
  labour_id uuid;
  cogs_id uuid;
BEGIN
  SELECT id INTO sales_id FROM transaction_categories WHERE code = 'SALES' LIMIT 1;
  SELECT id INTO labour_id FROM transaction_categories WHERE code = 'LABOUR' LIMIT 1;
  SELECT id INTO cogs_id FROM transaction_categories WHERE code = 'COGS' LIMIT 1;

  IF sales_id IS NOT NULL THEN
    UPDATE transactions SET category_id = sales_id WHERE category = 'sales' AND category_id IS NULL;
  END IF;

  IF labour_id IS NOT NULL THEN
    UPDATE transactions SET category_id = labour_id WHERE category = 'labor' AND category_id IS NULL;
  END IF;

  IF cogs_id IS NOT NULL THEN
    UPDATE transactions SET category_id = cogs_id WHERE category = 'food_cost' AND category_id IS NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_transactions_category;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'category'
  ) THEN
    ALTER TABLE transactions DROP COLUMN category;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'item_name'
  ) THEN
    ALTER TABLE transactions DROP COLUMN item_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE transactions DROP COLUMN quantity;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE transactions DROP COLUMN unit_price;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_number);
