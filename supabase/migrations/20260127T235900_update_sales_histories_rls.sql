-- Update RLS policies to allow all authenticated users to insert sales histories
ALTER TABLE production_sales_histories DROP POLICY IF EXISTS "Authenticated users can insert sales histories";

CREATE POLICY "Authenticated users can insert sales histories"
  ON production_sales_histories
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
