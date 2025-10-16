/*
  # Fix app_settings RLS policies

  1. Changes
    - Update RLS policies to avoid recursion
    - Use same pattern as user_profiles fix
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON app_settings;

-- Create new policies
CREATE POLICY "Anyone can read settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update settings"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      WITH admin_check AS (
        SELECT 1 FROM user_profiles up
        INNER JOIN user_roles ur ON up.role_id = ur.id
        WHERE up.id = auth.uid() 
        AND ur.name = 'Admin'
        LIMIT 1
      )
      SELECT 1 FROM admin_check
    )
  );

CREATE POLICY "Admins can insert settings"
  ON app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      WITH admin_check AS (
        SELECT 1 FROM user_profiles up
        INNER JOIN user_roles ur ON up.role_id = ur.id
        WHERE up.id = auth.uid() 
        AND ur.name = 'Admin'
        LIMIT 1
      )
      SELECT 1 FROM admin_check
    )
  );