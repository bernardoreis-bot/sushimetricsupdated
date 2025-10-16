/*
  # Add Saved Production Plans Feature

  1. New Table
    - `production_plans`
      - `id` (uuid, primary key)
      - `site_id` (uuid, foreign key to sites)
      - `plan_date` (date) - The date this production plan is for
      - `plan_data` (jsonb) - Stores the parsed production plan items
      - `filename` (text) - Original filename
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `production_plans` table
    - Add policies for authenticated users

  3. Indexes
    - Index on `site_id` for faster queries
    - Index on `plan_date` for date-based filtering
*/

CREATE TABLE IF NOT EXISTS production_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  plan_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  filename text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE production_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users"
  ON production_plans
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_production_plans_site_id ON production_plans(site_id);
CREATE INDEX IF NOT EXISTS idx_production_plans_plan_date ON production_plans(plan_date);
