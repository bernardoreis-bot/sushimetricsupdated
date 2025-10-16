/*
  # Rename inventory_item_name to powerbi_item_name

  1. Changes
    - Rename column `inventory_item_name` to `powerbi_item_name` in production_item_mappings table
  
  2. Notes
    - This is a simple column rename with no data loss
    - The column stores the name from PowerBI that maps to production plan items
*/

ALTER TABLE production_item_mappings 
RENAME COLUMN inventory_item_name TO powerbi_item_name;