/*
  # Completely Remove Recursive RLS from user_profiles

  1. Strategy
    - Remove ALL policies that check user_profiles for admin status
    - Only allow users to read their own profile
    - All admin operations (creating, updating, deleting users) MUST go through edge functions
    - Edge functions use service role which bypasses RLS
  
  2. Security
    - Individual users can only see their own profile
    - Admin operations are secured at the edge function level
    - No circular dependencies possible
*/

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can delete other profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users with Admin role can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users with Admin role can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users with Admin role can update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users with Admin role can delete profiles" ON user_profiles;

-- Create ONLY a self-read policy
CREATE POLICY "Users can read their own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- No INSERT, UPDATE, or DELETE policies
-- All modifications MUST go through edge functions using service role