# ✅ Flixify Production Deployment Checklist

## 🔐 1. Güvenlik

### Backend (.env.production)
- [ ] `JWT_SECRET` - 32+ karakter rastgele string
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Service role key (anon değil!)
- [ ] `CORS_ORIGIN` - Production domain (http://flixify.pro)

### Admin
- [ ] Default admin şifresi değiştirildi
- [ ] Admin email geçerli ve erişilebilir

---

## 🗄️ 2. Database (Supabase)

### Schema
- [ ] Tüm tablolar oluşturuldu (6 tablo)
- [ ] Indexes oluşturuldu
- [ ] RLS Policies aktif
- [ ] Triggers çalışıyor

### Seed Data
- [ ] Admin kullanıcısı eklendi
- [ ] 4 paket tanımlı (Temel, Standart, Premium, Aile)
- [ ] Paket fiyatları doğru

### Storage
- [ ] `payment-receipts` bucket oluşturuldu
- [ ] Public access ayarlandı
- [ ] Upload policies tanımlandı

---

## 🐳 3. Docker & Deployment

### Dosyalar
- [ ] `Dockerfile` (backend)
- [ ] `docker-compose.yml`
- [ ] `frontend/Dockerfile`
- [ ] `frontend/nginx.conf`
- [ ] `.dockerignore`

### Environment
- [ ] `frontend/.env.production` - API URL doğru
- [ ] `.env.production` - Tüm değerler dolu

### Build Test
- [ ] Backend build oluyor
- [ ] Frontend build oluyor
- [ ] Docker image oluşturuluyor

---

## 🌐 4. Domain & DNS

### DNS A Kayıtları
```
flixify.pro       → SUNUCU_IP
api.flixify.pro   → SUNUCU_IP
www.flixify.pro   → SUNUCU_IP
```

### SSL/HTTPS
- [ ] HTTP kullanıyoruz (M3U provider HTTP)
- [ ] HTTPS redirect kapalı

---

## 🚀 5. Coolify Deployment

### Backend (api.flixify.pro)
- [ ] Git repo bağlandı
- [ ] Dockerfile build pack seçildi
- [ ] Port 9199 ayarlandı
- [ ] Environment variables eklendi
- [ ] Domain atanmış
- [ ] Health check çalışıyor

### Frontend (flixify.pro)
- [ ] Git repo bağlandı
- [ ] Dockerfile build pack seçildi
- [ ] Port 80 ayarlandı
- [ ] Environment variables eklendi
- [ ] Domain atanmış

---

## 🧪 6. Testler

### Kullanıcı Akışı
- [ ] Ana sayfa açılıyor
- [ ] 16 haneli kod ile giriş yapılabiliyor
- [ ] IPTV player çalışıyor
- [ ] Kanallar listeleniyor
- [ ] M3U dosyası indirilebiliyor

### Ödeme Akışı
- [ ] Paketler görünüyor
- [ ] Ödeme sayfası açılıyor
- [ ] Dekont yüklenebiliyor
- [ ] Ödeme başarılı sayfası çalışıyor

### Admin Panel
- [ ] Admin login çalışıyor (şimdilik devre dışı)
- [ ] Dashboard yükleniyor
- [ ] Kullanıcı listesi görünüyor
- [ ] Ödemeler yönetilebiliyor

---

## 📊 7. Monitoring

### Logs
- [ ] Backend logları erişilebilir
- [ ] Error tracking aktif

### Performance
- [ ] API response time < 500ms
- [ ] Player yükleme süresi kabul edilebilir

---

## 🔄 8. Backup & Recovery

### Supabase
- [ ] Automated backups aktif
- [ ] PITR (Point in Time Recovery) ayarlandı

### Manuel Backup
```bash
# Database export
pg_dump -h db.vohisilzyxzmjdsalgea.supabase.co -U postgres -d postgres > backup.sql

# Storage backup
# Supabase dashboard'dan manually download
```

---

## 📱 9. Cross-Browser Test

- [ ] Chrome / Edge
- [ ] Firefox
- [ ] Safari (iOS)
- [ ] Chrome (Android)
- [ ] Smart TV browsers

---

## 🚨 10. Go-Live

### Son Kontroller
- [ ] Production .env dosyası doğru
- [ ] Test kullanıcıları silindi
- [ ] Admin şifresi değiştirildi
- [ ] Error monitoring aktif

### Launch
- [ ] DNS yayılımı tamamlandı
- [ ] SSL sertifikası geçerli (veya HTTP kullanılıyor)
- [ ] Smoke test yapıldı

---

## 🎉 Post-Launch

- [ ] Analytics kurulumu
- [ ] User feedback toplama
- [ ] Performance monitoring
- [ ] Regular backup kontrolü

---

**Tüm maddeler tamamlandığında site live!** 🚀
