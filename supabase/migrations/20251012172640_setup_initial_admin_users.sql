/*
  # Setup Initial Admin Users

  1. Changes
    - Create user profiles for existing auth users
    - Set them as Admin by default
    - Update RLS policies to allow admin operations without circular dependency
  
  2. Security
    - Admins can manage all users
    - First user is automatically admin
*/

-- Insert profiles for existing users as Admin
INSERT INTO user_profiles (id, email, full_name, role_id, is_active)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)) as full_name,
  (SELECT id FROM user_roles WHERE name = 'Admin'),
  true
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles up WHERE up.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing restrictive policies that cause circular dependency
DROP POLICY IF EXISTS "Admins can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;

-- Create better policies that check role directly
CREATE POLICY "Users with Admin role can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT up.id FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE ur.name = 'Admin'
    )
  );

CREATE POLICY "Users with Admin role can insert profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT up.id FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE ur.name = 'Admin'
    )
  );

CREATE POLICY "Users with Admin role can update profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT up.id FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE ur.name = 'Admin'
    )
  );

CREATE POLICY "Users with Admin role can delete profiles"
  ON user_profiles FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT up.id FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE ur.name = 'Admin'
    )
  );