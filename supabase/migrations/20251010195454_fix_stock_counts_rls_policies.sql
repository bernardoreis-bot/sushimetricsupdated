/*
  # Fix Stock Counts RLS Policies

  1. Changes
    - Drop existing RLS policies
    - Recreate policies to work with product_mapping_id
    - Ensure anon users can perform all operations

  2. Security
    - Allow full access for anonymous users (as per existing setup)
    - All CRUD operations permitted
*/

DROP POLICY IF EXISTS "Allow anonymous read stock_counts" ON stock_counts;
DROP POLICY IF EXISTS "Allow anonymous insert stock_counts" ON stock_counts;
DROP POLICY IF EXISTS "Allow anonymous update stock_counts" ON stock_counts;
DROP POLICY IF EXISTS "Allow anonymous delete stock_counts" ON stock_counts;

CREATE POLICY "Allow anonymous read stock_counts"
  ON stock_counts
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous insert stock_counts"
  ON stock_counts
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update stock_counts"
  ON stock_counts
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous delete stock_counts"
  ON stock_counts
  FOR DELETE
  TO anon
  USING (true);
