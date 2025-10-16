/*
  # Add Industry Benchmark Settings for People Tracker

  1. New Tables
    - `people_tracker_benchmarks`
      - `id` (uuid, primary key)
      - `site_id` (uuid, nullable) - For multi-site support
      - `retention_rate` (numeric) - Industry average retention rate percentage
      - `turnover_rate` (numeric) - Industry average turnover rate percentage
      - `notes` (text, nullable) - Optional notes about benchmark source
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `people_tracker_benchmarks` table
    - Add policies for authenticated users to read and update
    - Default values: UK Sushi Chef Hospitality sector (2025)
      - Retention Rate: 33%
      - Turnover Rate: 67%

  3. Initial Data
    - Insert default benchmark values for system-wide use
*/

-- Create benchmarks table
CREATE TABLE IF NOT EXISTS people_tracker_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  retention_rate numeric NOT NULL DEFAULT 33 CHECK (retention_rate >= 0 AND retention_rate <= 100),
  turnover_rate numeric NOT NULL DEFAULT 67 CHECK (turnover_rate >= 0 AND turnover_rate <= 100),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique constraint for site_id (one benchmark config per site, null for global)
CREATE UNIQUE INDEX IF NOT EXISTS people_tracker_benchmarks_site_idx 
  ON people_tracker_benchmarks(COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Enable RLS
ALTER TABLE people_tracker_benchmarks ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Authenticated users can view benchmarks"
  ON people_tracker_benchmarks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert benchmarks"
  ON people_tracker_benchmarks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update benchmarks"
  ON people_tracker_benchmarks
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default global benchmark (UK Sushi Chef Hospitality sector 2025)
INSERT INTO people_tracker_benchmarks (site_id, retention_rate, turnover_rate, notes)
VALUES (
  NULL,
  33,
  67,
  'UK Sushi Chef Hospitality sector (2025): Based on latest hospitality data and chef sector trends'
)
ON CONFLICT DO NOTHING;

-- Add audit log entry
INSERT INTO people_tracker_audit_log (table_name, record_id, action, new_data)
VALUES (
  'people_tracker_benchmarks',
  '00000000-0000-0000-0000-000000000000',
  'INSERT',
  '{"retention_rate": 33, "turnover_rate": 67, "source": "UK Sushi Chef Hospitality sector 2025"}'::jsonb
);
