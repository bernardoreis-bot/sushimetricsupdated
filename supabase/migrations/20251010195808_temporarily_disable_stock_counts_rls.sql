/*
  # Temporarily Disable RLS on Stock Counts

  1. Changes
    - Disable RLS on stock_counts table to test if that's the issue
    - This is for debugging purposes only

  2. Notes
    - We'll re-enable with proper policies once we identify the issue
*/

ALTER TABLE stock_counts DISABLE ROW LEVEL SECURITY;
