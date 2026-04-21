-- ============================================================
-- Migration: Add field_group to custom_fields
-- Run this on existing installations
-- ============================================================

ALTER TABLE custom_fields
  ADD COLUMN IF NOT EXISTS field_group VARCHAR(100) DEFAULT 'General';

-- Update existing rows that have no group
UPDATE custom_fields SET field_group = 'General' WHERE field_group IS NULL OR field_group = '';

-- Verify
SELECT id, field_label, field_key, field_type, field_group, sort_order, is_active
FROM custom_fields ORDER BY field_group, sort_order, id;
