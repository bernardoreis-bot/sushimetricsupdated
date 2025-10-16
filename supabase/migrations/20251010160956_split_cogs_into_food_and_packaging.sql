/*
  # Split COGS into Food Cost and Packaging Cost

  ## Summary
  Separates the combined Food & Packaging category into two distinct categories
  to allow tracking from different suppliers.

  ## Changes Made
  
  ### 1. Update existing COGS category
  - Change "Food & Packaging Cost" to just "Food Cost"
  - Keep COGS code for backward compatibility initially
  
  ### 2. Add new Packaging category
  - Create "Packaging Cost" category with code "PACKAGING"
  - Set as active by default
  
  ### 3. Update for better clarity
  - Rename COGS code to FOOD for clarity
  - Both categories will have their own tracking
*/

DO $$
DECLARE
  cogs_id uuid;
BEGIN
  SELECT id INTO cogs_id FROM transaction_categories WHERE code = 'COGS' LIMIT 1;
  
  IF cogs_id IS NOT NULL THEN
    UPDATE transaction_categories 
    SET 
      name = 'Food Cost',
      code = 'FOOD',
      updated_at = now()
    WHERE id = cogs_id;
  END IF;
END $$;

INSERT INTO transaction_categories (name, code, is_active)
VALUES ('Packaging Cost', 'PACKAGING', true)
ON CONFLICT (code) DO NOTHING;
