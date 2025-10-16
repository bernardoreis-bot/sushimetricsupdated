/*
  # Create Production Item Alias Mapping System

  1. New Tables
    - `production_item_aliases`
      - `id` (uuid, primary key)
      - `production_item_name` (text) - Name as it appears in production plan/Excel
      - `mapped_item_name` (text) - Canonical name from sales data/Power BI
      - `confidence_score` (numeric) - Match confidence 0-100
      - `match_type` (text) - 'exact', 'fuzzy', 'manual', 'synonym'
      - `created_by` (text) - User who created/confirmed mapping
      - `usage_count` (integer) - How many times this mapping has been used
      - `last_used_at` (timestamptz) - Last time this mapping was applied
      - `notes` (text, nullable) - Optional notes about the mapping
      - `site_id` (uuid, nullable) - For site-specific mappings
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Indexes
    - Unique index on (production_item_name, site_id) for fast lookups
    - Index on mapped_item_name for reverse lookups
    - Index on usage_count for popular mappings

  3. Security
    - Enable RLS on `production_item_aliases` table
    - Add policies for authenticated users to read and manage aliases

  4. Functions
    - Automatic usage tracking on alias application
    - Case-insensitive search support
*/

-- Create production item aliases table
CREATE TABLE IF NOT EXISTS production_item_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_item_name text NOT NULL,
  mapped_item_name text NOT NULL,
  confidence_score numeric DEFAULT 100 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  match_type text NOT NULL CHECK (match_type IN ('exact', 'fuzzy', 'manual', 'synonym', 'substring')),
  created_by text DEFAULT 'system',
  usage_count integer DEFAULT 0,
  last_used_at timestamptz,
  notes text,
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index for production item name per site (null for global)
CREATE UNIQUE INDEX IF NOT EXISTS production_item_aliases_name_site_idx 
  ON production_item_aliases(LOWER(TRIM(production_item_name)), COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Create index for mapped item lookups
CREATE INDEX IF NOT EXISTS production_item_aliases_mapped_idx 
  ON production_item_aliases(LOWER(TRIM(mapped_item_name)));

-- Create index for popular mappings
CREATE INDEX IF NOT EXISTS production_item_aliases_usage_idx 
  ON production_item_aliases(usage_count DESC);

-- Enable RLS
ALTER TABLE production_item_aliases ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Authenticated users can view aliases"
  ON production_item_aliases
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert aliases"
  ON production_item_aliases
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update aliases"
  ON production_item_aliases
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete aliases"
  ON production_item_aliases
  FOR DELETE
  TO authenticated
  USING (true);

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_alias_usage(alias_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE production_item_aliases
  SET 
    usage_count = usage_count + 1,
    last_used_at = now()
  WHERE id = alias_id;
END;
$$;

-- Insert common default aliases for sushi products
INSERT INTO production_item_aliases (production_item_name, mapped_item_name, match_type, confidence_score, notes)
VALUES
  ('Seaweed Salad', 'YO! Seaweed Salad P1', 'synonym', 100, 'Common product alias'),
  ('Edamame', 'YO! Edamame P1', 'synonym', 100, 'Common product alias'),
  ('Miso Soup', 'YO! Miso Soup P1', 'synonym', 100, 'Common product alias'),
  ('California Roll', 'California Roll 8pcs', 'synonym', 100, 'Roll product alias'),
  ('Salmon Nigiri', 'Salmon Nigiri 2pcs', 'synonym', 100, 'Nigiri product alias'),
  ('Tuna Nigiri', 'Tuna Nigiri 2pcs', 'synonym', 100, 'Nigiri product alias')
ON CONFLICT DO NOTHING;
