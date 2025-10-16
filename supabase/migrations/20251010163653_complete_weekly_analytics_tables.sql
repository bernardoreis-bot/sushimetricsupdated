/*
  # Complete Weekly Analytics Tables

  ## Summary
  Complete the weekly analytics tables by adding missing columns and creating
  the weekly_comparisons table for month-over-month and year-over-year comparisons.

  ## Changes Made
  
  ### 1. Update weekly_analytics_snapshots
  - Add avg_weekly_sales, avg_weekly_labour, avg_weekly_food, avg_weekly_packaging
  - Add updated_at timestamp
  - Create indexes for performance
  
  ### 2. Create weekly_comparisons table
  - Track historical comparisons
  - Month-over-month and year-over-year metrics
  
  ### 3. Security
  - Enable RLS with public access policies
*/

-- Add missing columns to weekly_analytics_snapshots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_analytics_snapshots' AND column_name = 'avg_weekly_sales'
  ) THEN
    ALTER TABLE weekly_analytics_snapshots ADD COLUMN avg_weekly_sales numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_analytics_snapshots' AND column_name = 'avg_weekly_labour'
  ) THEN
    ALTER TABLE weekly_analytics_snapshots ADD COLUMN avg_weekly_labour numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_analytics_snapshots' AND column_name = 'avg_weekly_food'
  ) THEN
    ALTER TABLE weekly_analytics_snapshots ADD COLUMN avg_weekly_food numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_analytics_snapshots' AND column_name = 'avg_weekly_packaging'
  ) THEN
    ALTER TABLE weekly_analytics_snapshots ADD COLUMN avg_weekly_packaging numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_analytics_snapshots' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE weekly_analytics_snapshots ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create indexes on weekly_analytics_snapshots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_weekly_snapshots_site_date'
  ) THEN
    CREATE INDEX idx_weekly_snapshots_site_date 
      ON weekly_analytics_snapshots(site_id, week_end_date DESC);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_unique_site_week'
  ) THEN
    CREATE UNIQUE INDEX idx_unique_site_week 
      ON weekly_analytics_snapshots(site_id, week_end_date);
  END IF;
END $$;

-- Create weekly_comparisons table
CREATE TABLE IF NOT EXISTS weekly_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE NOT NULL,
  week_end_date date NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('labour', 'food', 'packaging', 'sales')),
  current_value numeric DEFAULT 0,
  previous_month_value numeric DEFAULT 0,
  previous_year_value numeric DEFAULT 0,
  mom_change_percent numeric DEFAULT 0,
  yoy_change_percent numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create indexes on weekly_comparisons
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_weekly_comparisons_site_date'
  ) THEN
    CREATE INDEX idx_weekly_comparisons_site_date 
      ON weekly_comparisons(site_id, week_end_date DESC, metric_type);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_unique_comparison'
  ) THEN
    CREATE UNIQUE INDEX idx_unique_comparison 
      ON weekly_comparisons(site_id, week_end_date, metric_type);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE weekly_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_comparisons ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read weekly snapshots" ON weekly_analytics_snapshots;
DROP POLICY IF EXISTS "Anyone can insert weekly snapshots" ON weekly_analytics_snapshots;
DROP POLICY IF EXISTS "Anyone can update weekly snapshots" ON weekly_analytics_snapshots;
DROP POLICY IF EXISTS "Anyone can read weekly comparisons" ON weekly_comparisons;
DROP POLICY IF EXISTS "Anyone can insert weekly comparisons" ON weekly_comparisons;
DROP POLICY IF EXISTS "Anyone can update weekly comparisons" ON weekly_comparisons;

-- Create policies for weekly_analytics_snapshots
CREATE POLICY "Anyone can read weekly snapshots"
  ON weekly_analytics_snapshots
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert weekly snapshots"
  ON weekly_analytics_snapshots
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can update weekly snapshots"
  ON weekly_analytics_snapshots
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Create policies for weekly_comparisons
CREATE POLICY "Anyone can read weekly comparisons"
  ON weekly_comparisons
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert weekly comparisons"
  ON weekly_comparisons
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can update weekly comparisons"
  ON weekly_comparisons
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
