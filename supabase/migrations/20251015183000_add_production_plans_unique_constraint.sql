/*
  # Add Unique Constraint to Production Plans

  1. Changes
    - Add unique constraint on (site_id, plan_date) for production_plans table
    - This ensures only one production plan per site per date

  2. Security
    - No changes to RLS policies
*/

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_plans_site_id_plan_date_key'
  ) THEN
    ALTER TABLE production_plans
    ADD CONSTRAINT production_plans_site_id_plan_date_key
    UNIQUE (site_id, plan_date);
  END IF;
END $$;
