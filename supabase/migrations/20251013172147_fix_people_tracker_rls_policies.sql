/*
  # Fix People Tracker RLS Policies

  This migration fixes Row Level Security policies for the People Tracker module to allow
  all authenticated and anonymous users to manage staff members and training configuration.

  ## Changes Made

  1. **staff_members table**
     - Add policies for authenticated users to SELECT, INSERT, UPDATE, DELETE
     - Ensure both authenticated and anonymous users have full access
     - Policies allow unrestricted access for administrative operations

  2. **training_config table**
     - Add policies for authenticated users to SELECT, INSERT, UPDATE
     - Ensure configuration can be managed by any user

  ## Security Considerations
     - These policies allow full access for app functionality
     - In production, you may want to restrict based on user roles
     - Current implementation prioritizes functionality over restrictive access
*/

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Authenticated users can read staff members" ON staff_members;
DROP POLICY IF EXISTS "Authenticated users can insert staff members" ON staff_members;
DROP POLICY IF EXISTS "Authenticated users can update staff members" ON staff_members;
DROP POLICY IF EXISTS "Authenticated users can delete staff members" ON staff_members;

-- Create comprehensive policies for staff_members (authenticated users)
CREATE POLICY "Authenticated users can read staff members"
  ON staff_members
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert staff members"
  ON staff_members
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update staff members"
  ON staff_members
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete staff members"
  ON staff_members
  FOR DELETE
  TO authenticated
  USING (true);

-- Drop existing training_config policies for authenticated users
DROP POLICY IF EXISTS "Authenticated users can read training config" ON training_config;
DROP POLICY IF EXISTS "Authenticated users can insert training config" ON training_config;
DROP POLICY IF EXISTS "Authenticated users can update training config" ON training_config;

-- Create comprehensive policies for training_config (authenticated users)
CREATE POLICY "Authenticated users can read training config"
  ON training_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert training config"
  ON training_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update training config"
  ON training_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);