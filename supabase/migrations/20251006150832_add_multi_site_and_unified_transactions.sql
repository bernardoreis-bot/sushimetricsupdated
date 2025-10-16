/*
  # Multi-Site Management and Unified Transactions Schema

  1. New Tables
    - `sites`
      - `id` (uuid, primary key)
      - `name` (text) - Site name
      - `location` (text) - Address/location
      - `site_code` (text, unique) - Unique identifier
      - `is_active` (boolean) - Active status
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `suppliers`
      - `id` (uuid, primary key)
      - `name` (text, unique) - Supplier name
      - `contact_person` (text)
      - `phone` (text)
      - `email` (text)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `transactions`
      - `id` (uuid, primary key)
      - `transaction_date` (date)
      - `site_id` (uuid, foreign key to sites)
      - `category` (text) - 'sales', 'labor', 'food_cost'
      - `supplier_id` (uuid, foreign key to suppliers, nullable)
      - `item_name` (text, nullable)
      - `quantity` (numeric, nullable)
      - `unit_price` (numeric, nullable)
      - `amount` (numeric) - Total amount
      - `notes` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Modifications
    - Keep existing tables for backward compatibility
    - Add indexes for performance

  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text DEFAULT '',
  site_code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  contact_person text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date date NOT NULL,
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('sales', 'labor', 'food_cost')),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  item_name text,
  quantity numeric(10,2),
  unit_price numeric(10,2),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users on sites"
  ON sites FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users on suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users on transactions"
  ON transactions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_site ON transactions(site_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_sites_active ON sites(is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);
