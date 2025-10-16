/*
  # Revert Custom Extraction Patterns

  1. Changes
    - Remove `reference_pattern` column from `invoice_parsing_rules` table
    - This column was causing parsing issues and is no longer needed
    
  2. Notes
    - Returns the system to its original working state
    - All existing parsing rules will continue to work
*/

ALTER TABLE invoice_parsing_rules DROP COLUMN IF EXISTS reference_pattern;
