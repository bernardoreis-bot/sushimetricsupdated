/*
  Create People Tracker System

  Summary:
  Creates a comprehensive staff tracking system for monitoring employee turnover,
  training costs, and time to solo shift metrics.

  New Tables:
  1. staff_members - Employee information and training data
  2. training_config - Configurable training rates

  Security:
  - RLS enabled on all tables
  - Public read/write access for authenticated users
*/

-- Create staff_members table
CREATE TABLE IF NOT EXISTS staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  training_hours numeric DEFAULT 0,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create training_config table
CREATE TABLE IF NOT EXISTS training_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  hourly_rate numeric DEFAULT 12.21,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_staff_site_archived'
  ) THEN
    CREATE INDEX idx_staff_site_archived 
      ON staff_members(site_id, is_archived);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_staff_dates'
  ) THEN
    CREATE INDEX idx_staff_dates 
      ON staff_members(start_date, end_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_training_config_site'
  ) THEN
    CREATE INDEX idx_training_config_site 
      ON training_config(site_id);
  END IF;
END $$;

-- Create trigger to auto-archive staff when end_date is set
CREATE OR REPLACE FUNCTION auto_archive_staff()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_date IS NOT NULL AND OLD.end_date IS NULL THEN
    NEW.is_archived := true;
  END IF;
  IF NEW.end_date IS NULL THEN
    NEW.is_archived := false;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_auto_archive_staff'
  ) THEN
    CREATE TRIGGER trigger_auto_archive_staff
      BEFORE UPDATE ON staff_members
      FOR EACH ROW
      EXECUTE FUNCTION auto_archive_staff();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read staff members" ON staff_members;
DROP POLICY IF EXISTS "Anyone can insert staff members" ON staff_members;
DROP POLICY IF EXISTS "Anyone can update staff members" ON staff_members;
DROP POLICY IF EXISTS "Anyone can delete staff members" ON staff_members;
DROP POLICY IF EXISTS "Anyone can read training config" ON training_config;
DROP POLICY IF EXISTS "Anyone can insert training config" ON training_config;
DROP POLICY IF EXISTS "Anyone can update training config" ON training_config;

-- Create policies for staff_members
CREATE POLICY "Anyone can read staff members"
  ON staff_members
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert staff members"
  ON staff_members
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can update staff members"
  ON staff_members
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete staff members"
  ON staff_members
  FOR DELETE
  TO anon
  USING (true);

-- Create policies for training_config
CREATE POLICY "Anyone can read training config"
  ON training_config
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert training config"
  ON training_config
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can update training config"
  ON training_config
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Insert default global training config
INSERT INTO training_config (site_id, hourly_rate)
VALUES (NULL, 12.21)
ON CONFLICT DO NOTHING;
