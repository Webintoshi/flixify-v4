-- ============================================
-- FLIXIFY SEED DATA - SAFE VERSION
-- ============================================
-- Can be run multiple times, skips existing records

-- ============================================
-- 1. DEFAULT ADMIN
-- ============================================
-- Password: admin123 (bcrypt hash)

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
-- 2. DEFAULT PACKAGES
-- ============================================

INSERT INTO packages (name, description, price, duration_days, features, is_active, sort_order)
VALUES 
    ('Temel Paket', 'Başlangıç seviyesi IPTV deneyimi. 100+ kanal.', 49.99, 30, '["100+ Kanal", "SD Kalite", "7/24 Destek"]'::jsonb, true, 1),
    ('Standart Paket', 'En popüler seçim! 500+ kanal, HD kalite.', 99.99, 30, '["500+ Kanal", "HD Kalite", "Film & Dizi", "7/24 Destek"]'::jsonb, true, 2),
    ('Premium Paket', 'Tam IPTV deneyimi. 1000+ kanal, 4K kalite.', 149.99, 30, '["1000+ Kanal", "4K Kalite", "Film & Dizi", "Canlı Spor", "Uluslararası Kanallar"]'::jsonb, true, 3),
    ('Aile Paketi', '4 cihazda eşzamanlı izleme.', 199.99, 30, '["1000+ Kanal", "4K Kalite", "Çocuk Kanalları", "Eşzamanlı 4 Cihaz"]'::jsonb, true, 4)
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. VERIFICATION
-- ============================================
SELECT 
    (SELECT COUNT(*) FROM admins) as admin_count,
    (SELECT COUNT(*) FROM packages WHERE is_active = true) as package_count,
    (SELECT COUNT(*) FROM users) as user_count;
