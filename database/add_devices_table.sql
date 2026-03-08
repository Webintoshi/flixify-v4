-- ============================================
-- ADD DEVICES TABLE - For Real Device Tracking
-- ============================================

-- ============================================
-- 1. DEVICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL CHECK (device_type IN ('computer', 'phone', 'tablet', 'tv')),
    browser VARCHAR(100),
    os VARCHAR(100),
    ip_address INET,
    location VARCHAR(255),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_devices_user_id;
DROP INDEX IF EXISTS idx_devices_user_id_active;

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_user_id_active ON devices(user_id, is_active);

-- ============================================
-- 2. UPDATE ACTIVITY LOGS (Add more details)
-- ============================================
-- Already exists, but ensure it has device_id
ALTER TABLE activity_logs 
ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(id) ON DELETE SET NULL;

-- ============================================
-- 3. RLS POLICY FOR DEVICES
-- ============================================
ALTER TABLE IF EXISTS devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own devices" ON devices;
DROP POLICY IF EXISTS "Admins full access on devices" ON devices;

CREATE POLICY "Users can view own devices" ON devices
    FOR ALL USING (user_id IN (SELECT id FROM users WHERE code = COALESCE(current_setting('app.current_user_code', true), '')));

CREATE POLICY "Admins full access on devices" ON devices
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- 4. SAMPLE DEVICE DATA (For existing users)
-- ============================================
-- This will add sample devices for users if they don't have any
INSERT INTO devices (user_id, device_name, device_type, browser, os, ip_address, location, last_active, is_active)
SELECT 
    u.id,
    'Chrome - Windows',
    'computer',
    'Chrome',
    'Windows 10',
    '88.230.12.15'::inet,
    'Istanbul, Turkiye',
    NOW() - INTERVAL '2 hours',
    TRUE
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id)
LIMIT 1;

INSERT INTO devices (user_id, device_name, device_type, browser, os, ip_address, location, last_active, is_active)
SELECT 
    u.id,
    'iPhone 15 Pro',
    'phone',
    'Safari',
    'iOS 18',
    '88.230.12.15'::inet,
    'Istanbul, Turkiye',
    NOW() - INTERVAL '2 hours',
    TRUE
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.device_type = 'phone')
LIMIT 1;

INSERT INTO devices (user_id, device_name, device_type, browser, os, ip_address, location, last_active, is_active)
SELECT 
    u.id,
    'Samsung Smart TV',
    'tv',
    'Samsung Browser',
    'Tizen OS',
    '78.180.45.91'::inet,
    'Ankara, Turkiye',
    NOW() - INTERVAL '1 day',
    TRUE
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.device_type = 'tv')
LIMIT 1;

INSERT INTO devices (user_id, device_name, device_type, browser, os, ip_address, location, last_active, is_active)
SELECT 
    u.id,
    'iPad Air',
    'tablet',
    'Safari',
    'iPadOS 17',
    '92.44.120.33'::inet,
    'Izmir, Turkiye',
    NOW() - INTERVAL '3 days',
    TRUE
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.device_type = 'tablet')
LIMIT 1;

-- ============================================
-- 5. SAMPLE PAYMENT DATA (For existing users)
-- ============================================
INSERT INTO payments (user_id, user_code, amount, method, status, created_at)
SELECT 
    u.id,
    u.code,
    49.99,
    'Kredi Kartı',
    'approved',
    NOW() - INTERVAL '1 day'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id)
LIMIT 1;

INSERT INTO payments (user_id, user_code, amount, method, status, created_at)
SELECT 
    u.id,
    u.code,
    49.99,
    'Kredi Kartı',
    'approved',
    NOW() - INTERVAL '1 month'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.created_at < NOW() - INTERVAL '15 days')
LIMIT 1;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Devices table and sample data added successfully!' as status;
SELECT COUNT(*) as device_count FROM devices;
SELECT COUNT(*) as payment_count FROM payments;
