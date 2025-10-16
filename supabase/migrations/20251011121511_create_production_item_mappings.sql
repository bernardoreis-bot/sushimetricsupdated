/*
  # Create Production Item Mappings Table

  1. New Tables
    - `production_item_mappings`
      - `id` (uuid, primary key)
      - `production_plan_name` (text) - Name as it appears in production plan Excel
      - `inventory_item_name` (text) - Name as it appears in inventory/sales data
      - `site_id` (uuid, foreign key, nullable) - Optional site-specific mapping
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `production_item_mappings` table
    - Add policies for authenticated users to manage mappings

  3. Indexes
    - Add index on production_plan_name for fast lookups
    - Add unique constraint on production_plan_name + site_id combination

  ## Purpose
  This table is specifically for mapping production plan items to inventory items,
  completely separate from the stock_count item mappings which serve a different purpose.
*/

CREATE TABLE IF NOT EXISTS production_item_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_plan_name text NOT NULL,
  inventory_item_name text NOT NULL,
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE production_item_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view production item mappings"
  ON production_item_mappings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert production item mappings"
  ON production_item_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update production item mappings"
  ON production_item_mappings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete production item mappings"
  ON production_item_mappings
  FOR DELETE
  TO authenticated
  USING (true);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_production_mappings_plan_name 
  ON production_item_mappings(production_plan_name);

-- Create unique constraint (one mapping per production item per site)
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_mappings_unique 
  ON production_item_mappings(production_plan_name, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid));