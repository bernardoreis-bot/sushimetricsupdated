/*
  # Sushi Budget Management System Schema

  1. New Tables
    - `weekly_sales`
      - `id` (uuid, primary key)
      - `week_start_date` (date) - Monday of the week
      - `week_end_date` (date) - Sunday of the week
      - `total_sales` (numeric) - Total sales for the week
      - `labor_cost` (numeric) - Total labor cost for the week
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `purchases`
      - `id` (uuid, primary key)
      - `purchase_date` (date)
      - `supplier_name` (text)
      - `item_name` (text)
      - `quantity` (numeric)
      - `unit_price` (numeric)
      - `total_amount` (numeric)
      - `category` (text) - e.g., 'fish', 'rice', 'vegetables', etc.
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `daily_sales`
      - `id` (uuid, primary key)
      - `sale_date` (date)
      - `total_sales` (numeric)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their data
*/

CREATE TABLE IF NOT EXISTS weekly_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,
  total_sales numeric(10,2) DEFAULT 0,
  labor_cost numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date date NOT NULL,
  supplier_name text NOT NULL,
  item_name text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 0,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  category text DEFAULT 'other',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date date NOT NULL UNIQUE,
  total_sales numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE weekly_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users on weekly_sales"
  ON weekly_sales FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users on purchases"
  ON purchases FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users on daily_sales"
  ON daily_sales FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_weekly_sales_dates ON weekly_sales(week_start_date, week_end_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_date ON daily_sales(sale_date);
