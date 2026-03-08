# 🗄️ Flixify Database Setup Guide

## 📋 Schema Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `database/supabase-schema.sql` | **Ana şema** - Tüm tablolar, indexes, RLS |
| `database/seed_data.sql` | **Varsayılan veriler** - Admin, paketler |
| `database/migrations/001_initial_schema.sql` | Eski migration (opsiyonel) |

---

## 🚀 Kurulum Adımları

### Adım 1: Supabase Projesine Git

1. [Supabase Dashboard](https://app.supabase.com) aç
2. Proje: `vohisilzyxzmjdsalgea` seç
3. Sol menüden **SQL Editor** → **New Query**

---

### Adım 2: Schema Kurulumu

**`database/supabase-schema.sql` dosyasını kopyala ve yapıştır:**

```sql
-- Bu dosya şunları oluşturur:
-- 1. users tablosu
-- 2. admins tablosu  
-- 3. packages tablosu
-- 4. payments tablosu
-- 5. user_packages tablosu
-- 6. activity_logs tablosu
-- 7. Indexes (performans için)
-- 8. RLS Policies (güvenlik için)
-- 9. Triggers (updated_at auto-update)
```

**Run tuşuna bas** ✅

---

### Adım 3: Varsayılan Verileri Ekle

**`database/seed_data.sql` dosyasını kopyala ve yapıştır:**

```sql
-- Bu dosya şunları ekler:
-- 1. Default admin (admin@flixify.com / admin123)
-- 2. 4 adet IPTV paketi (Temel, Standart, Premium, Aile)
```

**Run tuşuna bas** ✅

---

### Adım 4: Storage Bucket Oluştur

Sol menüden **Storage** → **New Bucket**:

```
Name: payment-receipts
Public: ✅ Yes
File size limit: 5MB
Allowed MIME types: image/png, image/jpeg, image/jpg
```

**Policies ekle:**
```sql
-- Upload policy (authenticated users)
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-receipts');

-- Read policy (public)
CREATE POLICY "Public can read receipts"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'payment-receipts');
```

---

### Adım 5: Doğrulama

SQL Editor'de çalıştır:

```sql
-- Tabloları kontrol et
SELECT 
    'users' as table_name, count(*) as row_count FROM users
UNION ALL
SELECT 'admins', count(*) FROM admins
UNION ALL
SELECT 'packages', count(*) FROM packages
UNION ALL
SELECT 'payments', count(*) FROM payments
UNION ALL
SELECT 'user_packages', count(*) FROM user_packages
UNION ALL
SELECT 'activity_logs', count(*) FROM activity_logs;

-- Admin kontrol
SELECT email, role, created_at FROM admins;

-- Paketler kontrol
SELECT name, price, duration_days FROM packages ORDER BY sort_order;
```

**Beklenen sonuç:**
```
table_name    | row_count
--------------|----------
users         | 0
admins        | 1
packages      | 4
payments      | 0
user_packages | 0
activity_logs | 0
```

---

## 🔧 Script ile Kurulum (Alternatif)

Terminal'den:

```bash
cd iptv-platform

# Ortam değişkenlerini ayarla
export SUPABASE_URL=https://vohisilzyxzmjdsalgea.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Seed data ekle
node scripts/setup-database.js seed

# Doğrula
node scripts/setup-database.js verify
```

---

## ⚠️ Önemli Notlar

### Production'da Yapılacaklar:

1. **Admin şifresini değiştir!**
   - Login: `admin@flixify.com` / `admin123`
   - Admin Panel → Profil → Şifre Değiştir

2. **M3U Provider URL'sini doğrula:**
   - `.env.production` içinde: `M3U_PROVIDER_URL`

3. **JWT Secret'ı güçlü yap:**
   - En az 32 karakter rastgele string
   - Örnek: `openssl rand -base64 32`

4. **CORS origin'i ayarla:**
   - Production domain: `http://flixify.pro`

---

## 🐛 Sorun Giderme

### "Table does not exist" hatası
```sql
-- Schema çalışmamış, supabase-schema.sql'i tekrar çalıştır
```

### "Unique constraint violation" hatası
```sql
-- Veri zaten var, seed_data.sql'i çalıştırmaya gerek yok
-- Veya önce temizle:
TRUNCATE TABLE packages, admins RESTART IDENTITY CASCADE;
```

### "Permission denied" hatası
```sql
-- Service Role Key kullan (Anon key değil!)
-- Project Settings → API → service_role key
```

---

## 📊 Tablo Şeması Özeti

```
users
├── id (UUID, PK)
├── code (VARCHAR 16, UNIQUE)     ← Login kodu
├── email (VARCHAR 255, opsiyonel)
├── m3u_url (TEXT)                ← IPTV playlist URL
├── status (VARCHAR 20)           ← pending/active/suspended/expired
├── expires_at (TIMESTAMPTZ)      ← Abonelik bitiş
├── admin_notes (TEXT)
└── created_at/updated_at

admins
├── id (UUID, PK)
├── name (VARCHAR 100)
├── email (VARCHAR 255, UNIQUE)
├── password_hash (VARCHAR 255)   ← bcrypt hash
├── role (VARCHAR 20)             ← super/admin/editor
└── last_login (TIMESTAMPTZ)

packages
├── id (UUID, PK)
├── name (VARCHAR 100)
├── description (TEXT)
├── price (DECIMAL 10,2)          ← TL cinsinden
├── duration_days (INTEGER)       ← 30 (1 ay)
├── features (JSONB)              ← ["HD", "4K", vb.]
└── is_active (BOOLEAN)

payments
├── id (UUID, PK)
├── user_id (UUID, FK)
├── amount (DECIMAL 10,2)
├── method (VARCHAR 50)           ← Havale/Kredi Kartı/Kripto/Nakit
├── status (VARCHAR 20)           ← pending/approved/rejected
├── receipt_url (TEXT)            ← Storage URL
└── processed_by (UUID, FK)

user_packages
├── id (UUID, PK)
├── user_id (UUID, FK)
├── package_id (UUID, FK)
├── price_paid (DECIMAL 10,2)
├── started_at (TIMESTAMPTZ)
└── expires_at (TIMESTAMPTZ)

activity_logs
├── id (UUID, PK)
├── user_id/admin_id (UUID, FK)
├── action (VARCHAR 50)
├── entity_type (VARCHAR 50)
└── details (JSONB)
```

---

## ✅ Kurulum Tamamlandıktan Sonra

- [ ] Schema çalıştırıldı
- [ ] Seed data eklendi
- [ ] Storage bucket oluşturuldu
- [ ] Admin login test edildi
- [ ] Paketler görünüyor
- [ ] Backend bağlantısı test edildi

**GitHub'a pushlamaya hazırsın!** 🚀
