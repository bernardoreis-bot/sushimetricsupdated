/*
  # Fix Stock Counts RLS for Authenticated Users

  1. Changes
    - Drop existing anon-only policies
    - Create policies for both authenticated and anon users
    - Ensure all operations are allowed

  2. Security
    - Allow full access for authenticated users
    - Allow full access for anonymous users (for testing)
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow anonymous read stock_counts" ON stock_counts;
DROP POLICY IF EXISTS "Allow anonymous insert stock_counts" ON stock_counts;
DROP POLICY IF EXISTS "Allow anonymous update stock_counts" ON stock_counts;
DROP POLICY IF EXISTS "Allow anonymous delete stock_counts" ON stock_counts;

-- Create policies for authenticated users
CREATE POLICY "Allow authenticated read stock_counts"
  ON stock_counts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert stock_counts"
  ON stock_counts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update stock_counts"
  ON stock_counts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete stock_counts"
  ON stock_counts
  FOR DELETE
  TO authenticated
  USING (true);

-- Also create policies for anon users (for testing)
CREATE POLICY "Allow anon read stock_counts"
  ON stock_counts
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert stock_counts"
  ON stock_counts
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update stock_counts"
  ON stock_counts
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon delete stock_counts"
  ON stock_counts
  FOR DELETE
  TO anon
  USING (true);
