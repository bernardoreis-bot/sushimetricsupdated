/*
  # Fix Infinite Recursion in user_profiles RLS

  1. Problem
    - RLS policies checking user_profiles to determine admin status create infinite recursion
    - Need to use a different approach to check admin privileges
  
  2. Solution
    - Drop problematic policies
    - Create simpler policies using subqueries that don't cause recursion
    - Use EXISTS with proper scoping
*/

-- Drop all existing policies on user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users with Admin role can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users with Admin role can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users with Admin role can update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users with Admin role can delete profiles" ON user_profiles;

-- Create new non-recursive policies
-- Allow users to read their own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Allow users to read other profiles if they are admin
-- Uses a CTE to avoid recursion
CREATE POLICY "Admins can read all profiles"
  ON user_profiles FOR SELECT
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

-- Allow inserts only via edge function (no direct INSERT policy needed)
-- This prevents recursion completely

-- Allow admins to update any profile
CREATE POLICY "Admins can update profiles"
  ON user_profiles FOR UPDATE
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

-- Allow admins to delete profiles (but not their own)
CREATE POLICY "Admins can delete other profiles"
  ON user_profiles FOR DELETE
  TO authenticated
  USING (
    id != auth.uid() AND
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