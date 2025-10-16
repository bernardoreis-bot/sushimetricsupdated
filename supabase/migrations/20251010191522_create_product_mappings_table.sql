/*
  # Create Product Mappings Table

  1. New Tables
    - `product_mappings`
      - `id` (uuid, primary key)
      - `supplier_id` (uuid, foreign key) - which supplier this mapping belongs to
      - `supplier_product_code` (text) - supplier's product code
      - `supplier_product_name` (text) - supplier's product name
      - `internal_product_id` (uuid, foreign key, nullable) - links to internal products
      - `category` (text) - product category
      - `unit` (text) - unit of measurement
      - `notes` (text, nullable) - additional notes
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on product_mappings table
    - Allow public access for now

  3. Notes
    - Helps map supplier-specific product codes to internal products
    - Essential for stock counting and ordering
*/

CREATE TABLE IF NOT EXISTS product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_product_code TEXT NOT NULL,
  supplier_product_name TEXT NOT NULL,
  internal_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'Ambient',
  unit TEXT DEFAULT 'CASE',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_mappings_supplier') THEN
    CREATE INDEX idx_product_mappings_supplier ON product_mappings(supplier_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_mappings_code') THEN
    CREATE INDEX idx_product_mappings_code ON product_mappings(supplier_product_code);
  END IF;
END $$;

ALTER TABLE product_mappings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_mappings' AND policyname = 'Allow all access to product mappings'
  ) THEN
    CREATE POLICY "Allow all access to product mappings"
      ON product_mappings FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
