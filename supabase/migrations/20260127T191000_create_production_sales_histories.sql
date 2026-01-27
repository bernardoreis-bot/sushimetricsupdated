-- Create table to store processed sales history snapshots per site
CREATE TABLE IF NOT EXISTS production_sales_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  source_filename text,
  months_requested integer,
  months_used integer,
  periods text[],
  data jsonb NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid()
);

ALTER TABLE production_sales_histories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sales histories"
  ON production_sales_histories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sales histories"
  ON production_sales_histories
  FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can update their own sales histories"
  ON production_sales_histories
  FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can delete their own sales histories"
  ON production_sales_histories
  FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_production_sales_histories_site
  ON production_sales_histories(site_id, uploaded_at DESC);
