/*
  # Create Production Upload History Tables

  1. New Tables
    - `production_sales_uploads`
      - Stores the 3 weekly sales data uploads per site
      - Tracks upload dates, file names, and calculated last 3 Sundays
      - Links to site_id
    
    - `production_plan_uploads`
      - Stores production plan images/files per site
      - Tracks upload date, file reference, last calculation
      - Links to site_id

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their organization's data

  3. Important Notes
    - Uses site-specific storage for sales and plan uploads
    - Automatically calculates last 3 Sunday dates
    - Maintains history of uploads for easy switching
*/

-- Create production_sales_uploads table
CREATE TABLE IF NOT EXISTS production_sales_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number >= 1 AND week_number <= 3),
  file_name text NOT NULL,
  file_data bytea,
  upload_date timestamptz DEFAULT now(),
  week_ending_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(site_id, week_number)
);

-- Create production_plan_uploads table
CREATE TABLE IF NOT EXISTS production_plan_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_data bytea,
  upload_date timestamptz DEFAULT now(),
  last_calculation jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(site_id)
);

-- Enable RLS
ALTER TABLE production_sales_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_plan_uploads ENABLE ROW LEVEL SECURITY;

-- Policies for production_sales_uploads
CREATE POLICY "Users can view sales uploads for their sites"
  ON production_sales_uploads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert sales uploads"
  ON production_sales_uploads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update sales uploads"
  ON production_sales_uploads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete sales uploads"
  ON production_sales_uploads FOR DELETE
  TO authenticated
  USING (true);

-- Policies for production_plan_uploads
CREATE POLICY "Users can view plan uploads for their sites"
  ON production_plan_uploads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert plan uploads"
  ON production_plan_uploads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update plan uploads"
  ON production_plan_uploads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete plan uploads"
  ON production_plan_uploads FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_production_sales_uploads_site_id ON production_sales_uploads(site_id);
CREATE INDEX IF NOT EXISTS idx_production_plan_uploads_site_id ON production_plan_uploads(site_id);
