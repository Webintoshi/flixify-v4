-- ============================================
-- FLIXIFY SEED DATA - PRODUCTION
-- ============================================

-- NOTE: Run this AFTER supabase-schema.sql

-- ============================================
-- 1. DEFAULT ADMIN
-- ============================================
-- Password: admin123 (bcrypt hash)
-- CHANGE THIS IN PRODUCTION!

INSERT INTO admins (name, email, password_hash, role, last_login)
VALUES (
    'Super Admin',
    'admin@flixify.com',
    '$2b$10$X7oMybvz1xhfZg0qqP3hQexLRY5TpNgUzP9f9VJp3YhQJqLmQqKzW',
    'super',
    NOW()
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    updated_at = NOW();

-- ============================================
-- 2. DEFAULT PACKAGES (IPTV Subscription Plans)
-- ============================================

INSERT INTO packages (name, description, price, duration_days, features, is_active, sort_order)
VALUES 
    (
        'Temel Paket', 
        'Başlangıç seviyesi IPTV deneyimi. 100+ kanal ile temel eğlence ihtiyaçlarınızı karşılayın.',
        49.99, 
        30, 
        '["100+ Kanal", "SD Kalite", "7/24 Destek"]'::jsonb, 
        true, 
        1
    ),
    (
        'Standart Paket', 
        'En popüler seçim! 500+ kanal, HD kalite ve geniş içerik kütüphanesi.',
        99.99, 
        30, 
        '["500+ Kanal", "HD Kalite", "Film & Dizi", "7/24 Destek"]'::jsonb, 
        true, 
        2
    ),
    (
        'Premium Paket', 
        'Tam IPTV deneyimi. 1000+ kanal, 4K kalite ve tüm özellikler.',
        149.99, 
        30, 
        '["1000+ Kanal", "4K Kalite", "Film & Dizi", "Canlı Spor", "Uluslararası Kanallar", "7/24 Öncelikli Destek"]'::jsonb, 
        true, 
        3
    ),
    (
        'Aile Paketi', 
        'Aileniz için mükemmel seçim. 4 cihazda eşzamanlı izleme ve çocuk kanalları.',
        199.99, 
        30, 
        '["1000+ Kanal", "4K Kalite", "Çocuk Kanalları", "Eşzamanlı 4 Cihaz", "Film & Dizi", "Canlı Spor", "7/24 Öncelikli Destek"]'::jsonb, 
        true, 
        4
    )
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. SAMPLE USERS (For Testing - Optional)
-- ============================================
-- Uncomment for development testing

/*
INSERT INTO users (code, email, status, m3u_url, expires_at, admin_notes)
VALUES 
    (
        'X7F2A9B1C4D8E6F0', 
        NULL, 
        'pending', 
        NULL, 
        NULL, 
        'Test user - pending activation'
    ),
    (
        'A3B8C9D2E1F4G5H6', 
        'test@example.com', 
        'active', 
        'http://sifiriptvdns.com:80/playlist/username/password/m3u_plus', 
        NOW() + INTERVAL '30 days', 
        'Test user - active subscription'
    ),
    (
        'B4C5D6E7F8G9H0I1', 
        NULL, 
        'suspended', 
        NULL, 
        NULL, 
        'Test user - suspended for policy violation'
    )
ON CONFLICT (code) DO NOTHING;
*/

-- ============================================
-- 4. VERIFICATION
-- ============================================

-- Check admin count
SELECT 'Admins count: ' || COUNT(*) as status FROM admins;

-- Check packages count
SELECT 'Packages count: ' || COUNT(*) as status FROM packages WHERE is_active = true;

-- Check users count
SELECT 'Users count: ' || COUNT(*) as status FROM users;

-- ============================================
-- 5. IMPORTANT NOTES
-- ============================================

/*
⚠️ PRODUCTION CHECKLIST:

1. Change admin password immediately after first login!
   - Login with: admin@flixify.com / admin123
   - Go to Admin Panel → Profile → Change Password

2. Verify M3U Provider URL is correct in backend .env:
   M3U_PROVIDER_URL=http://sifiriptvdns.com:80/playlist/

3. Test payment flow with a sample payment

4. Configure email notifications if needed

5. Set up automated backups in Supabase dashboard

6. Monitor storage usage for payment receipts bucket

🔧 USEFUL QUERIES:

-- View all active users
SELECT code, status, expires_at FROM users WHERE status = 'active';

-- View pending payments
SELECT p.*, u.code FROM payments p LEFT JOIN users u ON p.user_id = u.id WHERE p.status = 'pending';

-- View package sales stats
SELECT 
    p.name,
    COUNT(up.id) as total_sales,
    SUM(up.price_paid) as total_revenue
FROM packages p
LEFT JOIN user_packages up ON p.id = up.package_id
GROUP BY p.id, p.name;

-- View recent activity
SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10;
*/
