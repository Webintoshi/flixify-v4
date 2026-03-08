-- =============================================================================
-- IPTV Platform Initial Schema
-- =============================================================================
-- 
-- This migration creates:
-- 1. users table with all required fields
-- 2. Indexes for performance
-- 3. RLS policies for security
-- 4. Trigger for updated_at
--
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 16-digit anonymous code (unique identifier for users)
    code VARCHAR(16) NOT NULL,
    
    -- User status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- M3U playlist URL (only for active users)
    m3u_url TEXT,
    
    -- Subscription expiration
    expires_at TIMESTAMPTZ,
    
    -- Admin notes
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT users_code_unique UNIQUE (code),
    CONSTRAINT users_code_format CHECK (code ~ '^[0-9A-F]{16}$'),
    CONSTRAINT users_status_check CHECK (status IN ('pending', 'active', 'suspended', 'expired'))
);

-- =============================================================================
-- INDEXES
-- =============================================================================
-- Primary lookup by code
CREATE INDEX IF NOT EXISTS idx_users_code ON users(code);

-- Filter by status (admin queries)
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Find expired users (cron job)
CREATE INDEX IF NOT EXISTS idx_users_expires_at ON users(expires_at) 
    WHERE status = 'active' AND expires_at IS NOT NULL;

-- Combined status + created for admin list queries
CREATE INDEX IF NOT EXISTS idx_users_status_created ON users(status, created_at DESC);

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access (for backend)
CREATE POLICY "Service role full access" ON users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Authenticated users can read their own data
-- Note: This uses a session variable set by the backend
CREATE POLICY "Users can read own data" ON users
    FOR SELECT
    TO authenticated
    USING (code = COALESCE(current_setting('app.current_user_code', true), ''));

-- Policy: Authenticated users cannot modify data
CREATE POLICY "Users cannot modify data" ON users
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- =============================================================================
-- AUDIT LOG TABLE (optional but recommended)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    performed_by TEXT,
    performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_at ON audit_logs(performed_at DESC);

-- =============================================================================
-- AUDIT TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, performed_by)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD), current_user);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW), current_user);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_data, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW), current_user);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to generate unique code
CREATE OR REPLACE FUNCTION generate_user_code()
RETURNS VARCHAR(16) AS $$
DECLARE
    new_code VARCHAR(16);
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate random hex string
        new_code := UPPER(ENCODE(GEN_RANDOM_BYTES(8), 'hex'));
        
        -- Check if code exists
        SELECT EXISTS(SELECT 1 FROM users WHERE code = new_code) INTO code_exists;
        
        -- Exit loop if code is unique
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Function to get user statistics
CREATE OR REPLACE FUNCTION get_user_stats()
RETURNS TABLE (
    status VARCHAR(20),
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT u.status, COUNT(*)::BIGINT
    FROM users u
    GROUP BY u.status
    ORDER BY u.status;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SEED DATA (for development)
-- =============================================================================
-- Uncomment for initial testing

/*
INSERT INTO users (code, status, m3u_url, expires_at, admin_notes) VALUES
('X7F2A9B1C4D8E6F0', 'pending', NULL, NULL, 'Test pending user'),
('A3B8C9D2E1F4G5H6', 'active', 'http://example.com/playlist.m3u', NOW() + INTERVAL '30 days', 'Test active user'),
('B4C5D6E7F8G9H0I1', 'suspended', NULL, NULL, 'Test suspended user');
*/

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE users IS 'IPTV users with anonymous code authentication';
COMMENT ON COLUMN users.code IS '16-digit hexadecimal anonymous code';
COMMENT ON COLUMN users.status IS 'User status: pending, active, suspended, expired';
COMMENT ON COLUMN users.m3u_url IS 'External M3U playlist URL (HTTP only)';
COMMENT ON COLUMN users.expires_at IS 'Subscription expiration timestamp';
