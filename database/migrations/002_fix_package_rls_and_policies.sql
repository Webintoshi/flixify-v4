-- ============================================
-- MIGRATION: Fix Package Visibility Issues
-- Issue: Packages not visible in admin/user panels
-- Root Cause: Missing RLS policy for public read
-- ============================================

-- ============================================
-- 1. ADD PUBLIC READ POLICY FOR PACKAGES
-- ============================================
-- Public (unauthenticated) users can view active packages
DROP POLICY IF EXISTS "Public can view active packages" ON packages;

CREATE POLICY "Public can view active packages" ON packages
    FOR SELECT 
    USING (is_active = true);

-- ============================================
-- 2. ADD AUTHENTICATED USER READ POLICY
-- ============================================
-- Authenticated users can also view active packages
DROP POLICY IF EXISTS "Authenticated users can view active packages" ON packages;

CREATE POLICY "Authenticated users can view active packages" ON packages
    FOR SELECT 
    TO authenticated
    USING (is_active = true);

-- ============================================
-- 3. VERIFY EXISTING PACKAGES
-- ============================================
-- Ensure all packages have proper defaults
UPDATE packages 
SET is_active = true 
WHERE is_active IS NULL;

UPDATE packages 
SET sort_order = 0 
WHERE sort_order IS NULL;

UPDATE packages 
SET features = '[]'::jsonb 
WHERE features IS NULL;

-- ============================================
-- 4. ADD MISSING COLUMNS (if needed)
-- ============================================
-- Add badge column if not exists (computed field storage)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'packages' AND column_name = 'badge'
    ) THEN
        ALTER TABLE packages ADD COLUMN badge VARCHAR(50);
    END IF;
END $$;

-- Add is_popular column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'packages' AND column_name = 'is_popular'
    ) THEN
        ALTER TABLE packages ADD COLUMN is_popular BOOLEAN DEFAULT false;
    END IF;
END $$;

-- ============================================
-- 5. VERIFY RLS IS ENABLED
-- ============================================
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================
-- Allow anon and authenticated roles to read active packages
GRANT SELECT ON packages TO anon;
GRANT SELECT ON packages TO authenticated;

-- ============================================
-- VERIFICATION QUERY (run manually to check)
-- ============================================
-- SELECT * FROM packages WHERE is_active = true;
-- SELECT * FROM pg_policies WHERE tablename = 'packages';
