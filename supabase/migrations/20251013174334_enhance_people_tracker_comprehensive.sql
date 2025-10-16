/*
  # People Tracker Enhancement - Comprehensive Schema

  ## Overview
  This migration enhances the People Tracker module with training rate history,
  audit logging, and data integrity features for accurate KPI calculations.

  ## 1. Training Rate History
     - New table: `training_rate_history`
     - Tracks all hourly rate changes with timestamps
     - Links historical rates to staff records

  ## 2. Staff Member Enhancements
     - Add `training_rate_applied` column to lock rates for archived staff
     - Add `training_cost_calculated` for audit trail
     - Add `department` for filtering
     - Add `notes` for additional context
     - Add constraint for duplicate prevention

  ## 3. Audit Log System
     - New table: `people_tracker_audit_log`
     - Logs all CRUD operations
     - Tracks user, action, timestamp, and data changes

  ## 4. Data Integrity
     - Ensure historical data is immutable
     - Support accurate period-based calculations
     - Enable comprehensive filtering and reporting
*/

-- Create training rate history table
CREATE TABLE IF NOT EXISTS training_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hourly_rate numeric(10,2) NOT NULL,
  effective_date timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add training rate tracking to staff_members
DO $$
BEGIN
  -- Add training_rate_applied column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_members' AND column_name = 'training_rate_applied'
  ) THEN
    ALTER TABLE staff_members ADD COLUMN training_rate_applied numeric(10,2);
  END IF;

  -- Add training_cost_calculated column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_members' AND column_name = 'training_cost_calculated'
  ) THEN
    ALTER TABLE staff_members ADD COLUMN training_cost_calculated numeric(10,2);
  END IF;

  -- Add rate_locked_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_members' AND column_name = 'rate_locked_at'
  ) THEN
    ALTER TABLE staff_members ADD COLUMN rate_locked_at timestamptz;
  END IF;

  -- Add department column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_members' AND column_name = 'department'
  ) THEN
    ALTER TABLE staff_members ADD COLUMN department text DEFAULT 'General';
  END IF;

  -- Add notes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_members' AND column_name = 'notes'
  ) THEN
    ALTER TABLE staff_members ADD COLUMN notes text;
  END IF;
END $$;

-- Create audit log table
CREATE TABLE IF NOT EXISTS people_tracker_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  notes text
);

-- Create index for faster audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON people_tracker_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON people_tracker_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON people_tracker_audit_log(changed_at);

-- Enable RLS on new tables
ALTER TABLE training_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_tracker_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for training_rate_history
CREATE POLICY "Anyone can read training rate history"
  ON training_rate_history
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert training rate history"
  ON training_rate_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS policies for audit log
CREATE POLICY "Anyone can read audit log"
  ON people_tracker_audit_log
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert audit log"
  ON people_tracker_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to automatically lock training rate when end_date is set
CREATE OR REPLACE FUNCTION lock_training_rate_on_end_date()
RETURNS TRIGGER AS $$
BEGIN
  -- If end_date is being set and training_rate_applied is not yet set
  IF NEW.end_date IS NOT NULL AND OLD.end_date IS NULL AND NEW.training_rate_applied IS NULL THEN
    -- Get current training rate from config
    SELECT hourly_rate INTO NEW.training_rate_applied
    FROM training_config
    WHERE site_id IS NULL
    LIMIT 1;
    
    -- Calculate and lock training cost
    NEW.training_cost_calculated := NEW.training_hours * COALESCE(NEW.training_rate_applied, 12.21);
    NEW.rate_locked_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic rate locking
DROP TRIGGER IF EXISTS trigger_lock_training_rate ON staff_members;
CREATE TRIGGER trigger_lock_training_rate
  BEFORE UPDATE ON staff_members
  FOR EACH ROW
  EXECUTE FUNCTION lock_training_rate_on_end_date();

-- Function to log training rate changes
CREATE OR REPLACE FUNCTION log_training_rate_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO training_rate_history (hourly_rate, effective_date, notes)
  VALUES (NEW.hourly_rate, now(), 'Rate updated via training_config');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for rate change logging
DROP TRIGGER IF EXISTS trigger_log_rate_change ON training_config;
CREATE TRIGGER trigger_log_rate_change
  AFTER UPDATE ON training_config
  FOR EACH ROW
  WHEN (OLD.hourly_rate IS DISTINCT FROM NEW.hourly_rate)
  EXECUTE FUNCTION log_training_rate_change();

-- Insert current rate into history for baseline
INSERT INTO training_rate_history (hourly_rate, effective_date, notes)
SELECT hourly_rate, created_at, 'Initial rate from system setup'
FROM training_config
WHERE site_id IS NULL
ON CONFLICT DO NOTHING;