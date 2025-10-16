/*
  # Create User Management and Role-Based Access System

  1. New Tables
    - `user_roles` - Defines available roles (Admin, Manager, Staff)
    - `user_permissions` - Defines granular permissions for accessing features
    - `role_permissions` - Maps roles to their permissions
    - `user_profiles` - Extends auth.users with role and profile information
  
  2. Security
    - Enable RLS on all tables
    - Admin can manage all users and permissions
    - Users can read their own profile
    - Managers can view staff but cannot modify admins
*/

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  level integer NOT NULL, -- 1=Admin, 2=Manager, 3=Staff
  created_at timestamptz DEFAULT now()
);

-- Insert default roles
INSERT INTO user_roles (name, description, level)
VALUES 
  ('Admin', 'Full system access and user management', 1),
  ('Manager', 'Can view reports and manage transactions', 2),
  ('Staff', 'Limited access to basic features', 3)
ON CONFLICT (name) DO NOTHING;

-- Create permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  category text NOT NULL, -- e.g., 'dashboard', 'transactions', 'users', etc.
  created_at timestamptz DEFAULT now()
);

-- Insert default permissions
INSERT INTO user_permissions (name, description, category)
VALUES 
  ('view_dashboard', 'View dashboard and analytics', 'dashboard'),
  ('view_transactions', 'View transactions', 'transactions'),
  ('create_transactions', 'Create new transactions', 'transactions'),
  ('edit_transactions', 'Edit existing transactions', 'transactions'),
  ('delete_transactions', 'Delete transactions', 'transactions'),
  ('view_stock', 'View stock counts', 'stock'),
  ('manage_stock', 'Create and edit stock counts', 'stock'),
  ('view_sites', 'View sites', 'settings'),
  ('manage_sites', 'Create and edit sites', 'settings'),
  ('view_suppliers', 'View suppliers', 'settings'),
  ('manage_suppliers', 'Create and edit suppliers', 'settings'),
  ('view_products', 'View products', 'products'),
  ('manage_products', 'Create and edit products', 'products'),
  ('view_users', 'View user list', 'users'),
  ('manage_users', 'Create, edit, and delete users', 'users'),
  ('view_production', 'View production planning', 'production'),
  ('manage_production', 'Manage production planning', 'production')
ON CONFLICT (name) DO NOTHING;

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES user_roles(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES user_permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- Grant Admin all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM user_roles WHERE name = 'Admin'),
  id
FROM user_permissions
ON CONFLICT DO NOTHING;

-- Grant Manager permissions (excluding user management)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM user_roles WHERE name = 'Manager'),
  id
FROM user_permissions
WHERE name != 'manage_users' AND name != 'delete_transactions'
ON CONFLICT DO NOTHING;

-- Grant Staff basic permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM user_roles WHERE name = 'Staff'),
  id
FROM user_permissions
WHERE name IN ('view_dashboard', 'view_transactions', 'view_stock', 'view_production')
ON CONFLICT DO NOTHING;

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role_id uuid REFERENCES user_roles(id),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Anyone can view roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for user_permissions  
CREATE POLICY "Anyone can view permissions"
  ON user_permissions FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for role_permissions
CREATE POLICY "Anyone can view role permissions"
  ON role_permissions FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE up.id = auth.uid() AND ur.name = 'Admin'
    )
  );

CREATE POLICY "Admins can insert profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE up.id = auth.uid() AND ur.name = 'Admin'
    )
  );

CREATE POLICY "Admins can update profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE up.id = auth.uid() AND ur.name = 'Admin'
    )
  );

CREATE POLICY "Admins can delete profiles"
  ON user_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE up.id = auth.uid() AND ur.name = 'Admin'
    )
  );