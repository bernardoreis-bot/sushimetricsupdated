/*
  # Enhance invoice_items for flexible line item storage

  1. Changes
    - Make product_id nullable to allow free-text items
    - Add item_name and item_code for storing invoice line item details
    - Add category field for classification
  
  2. Purpose
    - Store line items from parsed invoices
    - Allow manual entry of line items
    - Support order prediction calculations
*/

-- Make product_id nullable
ALTER TABLE invoice_items 
ALTER COLUMN product_id DROP NOT NULL;

-- Add fields for free-text line items
ALTER TABLE invoice_items 
ADD COLUMN IF NOT EXISTS item_name text,
ADD COLUMN IF NOT EXISTS item_code text,
ADD COLUMN IF NOT EXISTS category text DEFAULT 'Other';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoice_items_transaction_id ON invoice_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id) WHERE product_id IS NOT NULL;