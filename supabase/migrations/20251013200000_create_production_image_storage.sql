/*
  # Production Image Storage System

  1. New Tables
    - `site_sales_data_uploads`
      - Stores weekly sales data files per site
      - Tracks which weeks have data uploaded
      - Stores parsed PowerBI items

    - `site_production_images`
      - Stores production plan images per site and week
      - Stores OCR results and match data
      - Links to sales data used for matching

    - `production_requirements`
      - Stores calculated production requirements
      - Based on sales data and production targets
      - Includes item quantities and costs

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users
*/

-- Site Sales Data Uploads Table
CREATE TABLE IF NOT EXISTS site_sales_data_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  week_ending_date date NOT NULL,
  file_name text NOT NULL,
  file_url text,
  parsed_items jsonb DEFAULT '[]'::jsonb,
  unique_items text[] DEFAULT ARRAY[]::text[],
  item_count integer DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz DEFAULT now(),
  UNIQUE(site_id, week_number, week_ending_date)
);

ALTER TABLE site_sales_data_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all sales data uploads"
  ON site_sales_data_uploads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert sales data uploads"
  ON site_sales_data_uploads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own sales data uploads"
  ON site_sales_data_uploads FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can delete own sales data uploads"
  ON site_sales_data_uploads FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Site Production Images Table
CREATE TABLE IF NOT EXISTS site_production_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  week_ending_date date NOT NULL,
  image_url text NOT NULL,
  image_file_name text NOT NULL,
  ocr_results jsonb DEFAULT '[]'::jsonb,
  production_matches jsonb DEFAULT '[]'::jsonb,
  match_rate numeric(5,2) DEFAULT 0,
  total_items integer DEFAULT 0,
  matched_items integer DEFAULT 0,
  needs_review_items integer DEFAULT 0,
  processing_method text DEFAULT 'openai',
  sales_data_weeks integer DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz DEFAULT now(),
  UNIQUE(site_id, week_ending_date)
);

ALTER TABLE site_production_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all production images"
  ON site_production_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert production images"
  ON site_production_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own production images"
  ON site_production_images FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can delete own production images"
  ON site_production_images FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Production Requirements Table
CREATE TABLE IF NOT EXISTS production_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  production_image_id uuid REFERENCES site_production_images(id) ON DELETE CASCADE,
  week_ending_date date NOT NULL,
  item_name text NOT NULL,
  powerbi_item text NOT NULL,
  quantity_required numeric(10,2) NOT NULL,
  unit_price numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) DEFAULT 0,
  confidence_score numeric(5,2) DEFAULT 0,
  match_status text DEFAULT 'matched',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE production_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all production requirements"
  ON production_requirements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert production requirements"
  ON production_requirements FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update production requirements"
  ON production_requirements FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete production requirements"
  ON production_requirements FOR DELETE
  TO authenticated
  USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_uploads_site_week ON site_sales_data_uploads(site_id, week_ending_date);
CREATE INDEX IF NOT EXISTS idx_production_images_site_week ON site_production_images(site_id, week_ending_date);
CREATE INDEX IF NOT EXISTS idx_production_requirements_site ON production_requirements(site_id, week_ending_date);
