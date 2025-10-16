/*
  # Create App Settings Table

  1. New Table
    - `app_settings` - Stores application configuration like API keys
  
  2. Security
    - Enable RLS
    - Only authenticated users can read settings
    - Only admins can update settings
*/

CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value text,
  description text,
  is_encrypted boolean DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default setting for Gemini API
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES ('gemini_api_key', '', 'Google Gemini API key for AI-powered features')
ON CONFLICT (setting_key) DO NOTHING;

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update settings"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT up.id FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE ur.name = 'Admin'
    )
  );

CREATE POLICY "Admins can insert settings"
  ON app_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT up.id FROM user_profiles up
      JOIN user_roles ur ON up.role_id = ur.id
      WHERE ur.name = 'Admin'
    )
  );