-- ============================================
-- MIGRATION: Soft Delete for Users
-- ============================================
-- Adds deleted_at column and updates queries to filter deleted users

-- 1. Add deleted_at column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 2. Add index for performance (filtering active users)
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) 
WHERE deleted_at IS NULL;

-- 3. Create view for active users only (convenience)
CREATE OR REPLACE VIEW active_users AS
SELECT * FROM users 
WHERE deleted_at IS NULL;

-- 4. Update existing queries to use soft delete filter
-- Note: Application layer will handle this, but RLS policies can enforce it

-- 5. Create function to permanently delete old soft-deleted users (GDPR compliance)
CREATE OR REPLACE FUNCTION permanently_delete_old_users(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Only delete users soft-deleted more than X days ago
    DELETE FROM users 
    WHERE deleted_at IS NOT NULL 
      AND deleted_at < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- NOTES FOR APPLICATION LAYER
-- ============================================
-- 
-- 1. SELECT queries should filter: WHERE deleted_at IS NULL
-- 2. DELETE should UPDATE: SET deleted_at = NOW() WHERE id = ?
-- 3. Count queries should exclude deleted users
-- 4. Payments remain intact (user_id preserved, not set to NULL)
--
-- Payments table already has: ON DELETE SET NULL for user_id
-- We need to change this to preserve user_id for analytics
-- ============================================

-- 6. Alter payments table to preserve user_id on user delete
-- First check if foreign key exists
DO $$
BEGIN
    -- Drop existing foreign key if exists (it might have ON DELETE SET NULL)
    ALTER TABLE payments 
    DROP CONSTRAINT IF EXISTS payments_user_id_fkey;
    
    -- Recreate with NO ACTION (prevent delete if payments exist)
    -- This enforces checking in application layer
    ALTER TABLE payments
    ADD CONSTRAINT payments_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Foreign key modification skipped: %', SQLERRM;
END $$;

-- 7. Create analytics view that includes all payments (even deleted users)
CREATE OR REPLACE VIEW payment_analytics AS
SELECT 
    p.*,
    u.code as user_code,
    u.deleted_at as user_deleted_at,
    CASE WHEN u.deleted_at IS NULL THEN 'active' ELSE 'deleted' END as user_status
FROM payments p
LEFT JOIN users u ON p.user_id = u.id;

-- 8. Comment for documentation
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp. NULL = active user';
