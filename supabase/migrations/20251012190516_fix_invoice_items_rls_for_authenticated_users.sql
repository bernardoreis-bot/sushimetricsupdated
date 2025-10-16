/*
  # Fix invoice_items RLS for Authenticated Users

  1. Problem
    - Line items can't be saved by authenticated users
    - Only anon role has permissions
  
  2. Solution
    - Add policies for authenticated role
    - Keep existing anon policies for compatibility
*/

-- Drop if exists and recreate for authenticated users
DROP POLICY IF EXISTS "Authenticated users can read invoice_items" ON invoice_items;
DROP POLICY IF EXISTS "Authenticated users can insert invoice_items" ON invoice_items;
DROP POLICY IF EXISTS "Authenticated users can update invoice_items" ON invoice_items;
DROP POLICY IF EXISTS "Authenticated users can delete invoice_items" ON invoice_items;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can read invoice_items"
  ON invoice_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert invoice_items"
  ON invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoice_items"
  ON invoice_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete invoice_items"
  ON invoice_items FOR DELETE
  TO authenticated
  USING (true);