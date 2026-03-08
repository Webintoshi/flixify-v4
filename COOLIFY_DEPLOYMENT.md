# 🚀 Flixify Coolify Deployment Guide (HTTP)

## Domain Yapısı (HTTP)

```
flixify.pro           → Frontend (React/Vite)
api.flixify.pro       → Backend (Node.js/Express)
```

> ⚠️ **Önemli:** M3U provider HTTP olduğu için tüm site HTTP olarak çalışıyor.

---

## 📋 Ön Gereksinimler

- Ubuntu 22.04 LTS sunucu
- Minimum 2 CPU / 2GB RAM / 20GB SSD
- Domain: flixify.pro
- DNS erişimi

---

## 1. Sunucu Hazırlama

```bash
# Sunucuya SSH ile bağlan
ssh root@SUNUCU_IP

# Update
apt update && apt upgrade -y

# Coolify kur
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Kurulum tamamlandığında terminalde URL ve şifre gösterilecek.

---

## 2. Coolify Web Arayüzü

**Giriş:** `http://SUNUCU_IP:8000`

### 2.1 Proje Oluştur

1. "New Project" → `flixify`
2. Add Resource → "Application"

---

## 3. Backend Deployment (api.flixify.pro)

### Git Ayarları

| Ayar | Değer |
|------|-------|
| Repository | `github.com/KULLANICI/flixify-repo` |
| Branch | `main` |
| Build Pack | `Dockerfile` |
| Dockerfile Path | `./Dockerfile` |
| Base Directory | `/` |
| Port | `9199` |

### Environment Variables

```env
NODE_ENV=production
PORT=9199
JWT_SECRET=super-gizli-jwt-anahtari-buraya-uzun-bir-sey-yaz
SUPABASE_URL=https://vohisilzyxzmjdsalgea.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
M3U_PROVIDER_URL=http://sifiriptvdns.com:80/playlist/
CORS_ORIGIN=http://app.flixify.pro
```

### Domain Ayarları

- **Domains:** `api.flixify.pro`
- **HTTPS:** Disabled (HTTP kullanıyoruz)

---

## 4. Frontend Deployment (flixify.pro)

### Git Ayarları

| Ayar | Değer |
|------|-------|
| Repository | `github.com/KULLANICI/flixify-repo` |
| Branch | `main` |
| Build Pack | `Dockerfile` |
| Dockerfile Path | `./frontend/Dockerfile` |
| Base Directory | `./frontend` |
| Port | `80` |

### Environment Variables

```env
VITE_API_URL=http://api.flixify.pro/api/v1
```

### Domain Ayarları

- **Domains:** `flixify.pro`, `www.flixify.pro`
- **HTTPS:** Disabled (HTTP kullanıyoruz)

---

## 5. DNS Ayarları

Domain sağlayıcında (Cloudflare/Namecheap/vs):

```
A     flixify.pro        → SUNUCU_IP
A     api.flixify.pro    → SUNUCU_IP
A     www.flixify.pro    → SUNUCU_IP
```

> ⚠️ **Cloudflare kullanıyorsan:** Proxy'i KAPAT (grey cloud)

---

## 6. Post-Deployment Kontroller

### Backend Test
```bash
curl http://api.flixify.pro/health
```

### Frontend Test
Tarayıcıda: `http://flixify.pro`

---

## 🔧 Sorun Giderme

### Mixed Content Hatası
Eğer hala mixed content hatası alırsan:

1. Tarayıcı console'u aç (F12)
2. Hangi URL'nin HTTPS istediğini kontrol et
3. Frontend'de hardcoded `https://` var mı diye ara

### CORS Hatası
Backend environment'da `CORS_ORIGIN` doğru mu kontrol et:
```env
CORS_ORIGIN=http://flixify.pro
```

### M3U Yüklenmiyor
M3U provider HTTP, site HTTPS olursa engellenir. Tüm site HTTP olmalı.

---

## ✅ Deployment Checklist

- [ ] Coolify kurulu
- [ ] Backend deploy edildi (`api.flixify.pro`)
- [ ] Frontend deploy edildi (`flixify.pro`)
- [ ] DNS A kayıtları yapıldı
- [ ] Environment variables doğru
- [ ] M3U test edildi
- [ ] Login test edildi
- [ ] Admin panel test edildi
