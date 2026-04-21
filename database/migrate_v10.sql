-- migrate_v10.sql
-- Remove mac_address column from extended inventory items table
-- MAC Address field has been removed from all Ext. Asset Inventory pages

SET search_path = ext_inv, public;

ALTER TABLE ext_inv.items DROP COLUMN IF EXISTS mac_address;
