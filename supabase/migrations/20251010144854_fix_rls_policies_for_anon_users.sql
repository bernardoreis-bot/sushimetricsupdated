/*
  # Fix RLS Policies for Anonymous Users

  1. Changes
    - Update RLS policies to allow operations for both authenticated and anonymous users
    - This enables the app to work without requiring authentication setup
    - Policies now use `TO public` instead of `TO authenticated`

  2. Security Notes
    - For production use, authentication should be implemented
    - Current setup allows any user to access data
    - Suitable for single-user or trusted environments
*/

DROP POLICY IF EXISTS "Allow all operations for authenticated users on sites" ON sites;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on suppliers" ON suppliers;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on transactions" ON transactions;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on weekly_sales" ON weekly_sales;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on purchases" ON purchases;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on daily_sales" ON daily_sales;

CREATE POLICY "Allow all operations for public users on sites"
  ON sites FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for public users on suppliers"
  ON suppliers FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for public users on transactions"
  ON transactions FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for public users on weekly_sales"
  ON weekly_sales FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for public users on purchases"
  ON purchases FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for public users on daily_sales"
  ON daily_sales FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
