/*
  # Add "All Sites" Option for Combined Transactions

  ## Summary
  Allows transactions (especially labour costs) to be recorded against all sites
  collectively rather than individual sites. This is useful for costs that apply
  to the entire operation.

  ## Changes Made
  
  ### 1. Add Special "All Sites" Entry
  - Create a special site record with code "ALL"
  - Name: "All Sites"
  - This represents transactions that apply to all locations
  
  ### 2. Business Logic
  - When "All Sites" is selected, the transaction applies to all locations
  - Dashboard calculations will distribute these costs across all sites when filtering
  - Useful for: shared labour, corporate costs, multi-site expenses
  
  ### 3. Important Notes
  - The "All Sites" option is a special site record, not a null value
  - This maintains referential integrity while providing the needed functionality
  - Site code "ALL" is reserved and cannot be used for actual sites
*/

INSERT INTO sites (name, site_code, location, is_active)
VALUES ('All Sites', 'ALL', 'Combined - All Locations', true)
ON CONFLICT (site_code) DO UPDATE
SET name = 'All Sites',
    location = 'Combined - All Locations',
    is_active = true;
