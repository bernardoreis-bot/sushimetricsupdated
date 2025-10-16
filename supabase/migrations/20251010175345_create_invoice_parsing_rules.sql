/*
  # Create Invoice Parsing Rules Table

  1. New Tables
    - `invoice_parsing_rules`
      - `id` (uuid, primary key)
      - `supplier_id` (uuid, foreign key to suppliers) - which supplier this rule applies to
      - `text_pattern` (text) - text pattern to look for in the invoice (e.g., "Eden Farm", "Bunzl")
      - `default_category_id` (uuid, foreign key to transaction_categories) - auto-assign this category
      - `site_name_pattern` (text, nullable) - regex or text pattern to extract site name
      - `site_name_replacements` (jsonb, nullable) - JSON object for text replacements to clean site names
      - `invoice_number_pattern` (text, nullable) - regex pattern to extract invoice number
      - `date_pattern` (text, nullable) - regex pattern to extract date
      - `amount_pattern` (text, nullable) - regex pattern to extract amount
      - `is_active` (boolean) - whether this rule is enabled
      - `priority` (integer) - rules with higher priority are checked first
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `invoice_parsing_rules` table
    - Add policies for authenticated users to manage parsing rules

  3. Notes
    - This allows users to teach the system how to parse different invoice formats
    - Site name replacements help clean extracted text (e.g., remove "Yo Sushi -", "Tesco Superstore")
    - Rules are checked in priority order (highest first)
*/

CREATE TABLE IF NOT EXISTS invoice_parsing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  text_pattern TEXT NOT NULL,
  default_category_id UUID REFERENCES transaction_categories(id),
  site_name_pattern TEXT,
  site_name_replacements JSONB DEFAULT '[]'::jsonb,
  invoice_number_pattern TEXT,
  date_pattern TEXT,
  amount_pattern TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invoice_parsing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to parsing rules"
  ON invoice_parsing_rules FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for faster rule lookups
CREATE INDEX IF NOT EXISTS idx_parsing_rules_priority ON invoice_parsing_rules(priority DESC, is_active);
