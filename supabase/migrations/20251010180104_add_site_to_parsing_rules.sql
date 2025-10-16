/*
  # Add Site Selection to Parsing Rules

  1. Changes
    - Add `default_site_id` column to `invoice_parsing_rules` table
    - This allows rules to auto-assign a specific site when matched

  2. Notes
    - If a site is specified in the rule, it will be used directly
    - If no site is specified, the system will try to extract and match from the invoice text
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_parsing_rules' AND column_name = 'default_site_id'
  ) THEN
    ALTER TABLE invoice_parsing_rules ADD COLUMN default_site_id UUID REFERENCES sites(id);
  END IF;
END $$;
