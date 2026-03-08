-- ============================================
-- FLIXIFY IPTV PLATFORM - SUPABASE SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(16) UNIQUE NOT NULL,
    email VARCHAR(255),
    m3u_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'expired')),
    expires_at TIMESTAMP WITH TIME ZONE,
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster code lookups
CREATE INDEX idx_users_code ON users(code);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_expires_at ON users(expires_at);

-- ============================================
-- 2. ADMINS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('super', 'admin', 'editor')),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_admins_email ON admins(email);

-- ============================================
-- 3. PACKAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 30,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    is_popular BOOLEAN DEFAULT FALSE,
    badge VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_packages_is_active ON packages(is_active);
CREATE INDEX idx_packages_sort_order ON packages(sort_order);

-- ============================================
-- 4. PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_code VARCHAR(16),
    amount DECIMAL(10, 2) NOT NULL,
    method VARCHAR(50) NOT NULL CHECK (method IN ('Havale', 'Kredi Kartı', 'Kripto', 'Nakit')),
    bank VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    receipt_url TEXT,
    reject_reason TEXT,
    note TEXT,
    processed_by UUID REFERENCES admins(id) ON DELETE SET NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- ============================================
-- 5. USER PACKAGES (HISTORY)
-- ============================================
CREATE TABLE IF NOT EXISTS user_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
    price_paid DECIMAL(10, 2),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_packages_user_id ON user_packages(user_id);
CREATE INDEX idx_user_packages_active ON user_packages(is_active);

-- ============================================
-- 6. ACTIVITY LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users: Public can view their own data by code
CREATE POLICY "Users can view own data by code" ON users
    FOR SELECT USING (true); -- Will be filtered in application layer

-- Admins: Only admins can manage data
CREATE POLICY "Admins full access" ON users
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins full access on admins" ON admins
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins full access on packages" ON packages
    FOR ALL USING (auth.role() = 'service_role');

-- Public: Everyone can view active packages (for pricing page)
CREATE POLICY "Public can view active packages" ON packages
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admins full access on payments" ON payments
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default admin (password: admin123 - change in production!)
INSERT INTO admins (name, email, password_hash, role)
VALUES (
    'Super Admin',
    'admin@flixify.com',
    '$2b$10$YourHashedPasswordHere', -- Replace with actual bcrypt hash
    'super'
)
ON CONFLICT (email) DO NOTHING;

-- Insert default packages (with proper is_popular and badge)
INSERT INTO packages (name, description, price, duration_days, features, sort_order, is_popular, badge)
VALUES 
    ('Temel', 'Temel paket ile başlayın', 50, 30, '["100+ Kanal", "SD Kalite"]', 1, false, null),
    ('Standart', 'En popüler paket', 100, 30, '["500+ Kanal", "HD Kalite", "Film & Dizi"]', 2, false, null),
    ('Premium', 'Tam deneyim', 150, 30, '["1000+ Kanal", "4K Kalite", "Film & Dizi", "Canlı Spor"]', 3, true, 'Popüler'),
    ('Aile', 'Aile boyu eğlence', 200, 30, '["1000+ Kanal", "4K Kalite", "Çocuk Kanalları", "Eşzamanlı 4 Cihaz"]', 4, false, 'En İyi')
ON CONFLICT DO NOTHING;

