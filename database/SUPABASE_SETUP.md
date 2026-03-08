# Supabase Kurulum Rehberi

## 1. Supabase Projesi Oluşturma

Proje zaten oluşturulmuş: `https://vohisilzyxzmjdsalgea.supabase.co`

## 2. SQL Editor ile Tabloları Oluşturma

1. Supabase Dashboard'a giriş yap: https://app.supabase.com
2. Proje seç: `vohisilzyxzmjdsalgea`
3. Sol menüden **SQL Editor**'a tıkla
4. **New query** butonuna tıkla
5. `supabase-schema.sql` dosyasının içeriğini kopyala ve yapıştır
6. **Run** butonuna tıkla

## 3. Environment Variables Ayarlama

### Backend (.env)
```env
# Supabase Configuration
SUPABASE_URL=https://vohisilzyxzmjdsalgea.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvaGlzaWx6eXh6bWpkc2FsZ2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTE2MzksImV4cCI6MjA4Nzg4NzYzOX0.Agwi6PA4-sCq4nMOZiUhpqksBu0DC7dlzd6T1VuOzjw
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvaGlzaWx6eXh6bWpkc2FsZ2VhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjMxMTYzOSwiZXhwIjoyMDg3ODg3NjM5fQ.zA5NfKLwGlHOamq3Xj3rIr-ZvwwI6xQ5RfzNCBghbAg
```

## 4. Storage Bucket Oluşturma (Ödeme Dekontları için)

1. Sol menüden **Storage**'a tıkla
2. **New bucket** butonuna tıkla
3. Bucket name: `payment-receipts`
4. **Public bucket** seçeneğini işaretle
5. **Create bucket** butonuna tıkla

## 5. Auth Ayarları

1. Sol menüden **Authentication** > **Providers**'a git
2. **Email** provider'ı etkinleştir
3. **Confirm email** seçeneğini kapat (IPTV için gerekli değil)

## 6. API URL'leri

| Amaç | URL |
|------|-----|
| REST API | `https://vohisilzyxzmjdsalgea.supabase.co/rest/v1` |
| Auth | `https://vohisilzyxzmjdsalgea.supabase.co/auth/v1` |
| Realtime | `wss://vohisilzyxzmjdsalgea.supabase.co/realtime/v1` |

## 7. Test Sorguları

```sql
-- Tüm kullanıcıları listele
SELECT * FROM users;

-- Aktif paketleri listele
SELECT * FROM packages WHERE is_active = true;

-- Bekleyen ödemeleri listele
SELECT * FROM payments WHERE status = 'pending';
```
