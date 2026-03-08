# M3U Kurtarma Debug Rehberi

## 🚨 HIZLI DURUM TESPİTİ

### 1. Backend Log Kontrolü
```bash
ssh root@46.225.183.57
docker logs flixify-backend --tail 100 | grep -E "M3U|proxy|ERROR"
```

### 2. Endpoint Testleri
```bash
# Health check
curl http://46.225.183.57:3000/api/v1/m3u/health

# Test provider (no auth)
curl http://46.225.183.57:3000/api/v1/m3u/test-provider

# M3U proxy (with auth) - KULLANICI TOKEN'I GEREKLI
curl -H "Authorization: Bearer TOKEN" \
  http://46.225.183.57:3000/api/v1/m3u/A3A34BAB6D364E86.m3u
```

### 3. Provider Doğrudan Test
```bash
curl -H "User-Agent: VLC/3.0.18" \
  "http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus" | head -20
```

---

## 🔧 Olası Sorunlar ve Çözümler

### Senaryo 1: Circuit Breaker Açık Kalmış
**Belirti:** Loglarda "Circuit Breaker OPENED"
```bash
# Hızlı çözüm: Restart
docker-compose restart backend
```

### Senaryo 2: IP Ban (Provider tarafından)
**Belirti:** Provider curl ile çalışıyor ama backend'den 403/empty
```bash
# Sunucu IP'sini değiştir veya proxy kullan
# Ya da provider ile iletişime geç
```

### Senaryo 3: Kullanıcı M3U URL'si Boş/Geçersiz
**Belirti:** "No M3U URL assigned" hatası
- Admin panelden kullanıcıya M3U URL tanımla

### Senaryo 4: Cache Bozuk
**Belirti:** İlk istek çalışıyor, sonrakiler boş
```bash
# Redis cache temizle (varsa)
docker exec -it flixify-redis redis-cli FLUSHALL
# veya backend restart
```

---

## 🆘 ACİL ROLLBACK (Son Çare)

Eğer hiçbir şey çalışmıyorsa, son bilinen çalışan sürüme dön:

```bash
cd /var/www/flixify-pro

# Son bilinen çalışan commit (değiştir)
git log --oneline --all | head -20

# Örnek: 3 commit öncesine dön
git reset --hard HEAD~3
docker-compose restart
```

---

## 📊 BANA GÖNDERMEN GEREKENLER

1. **Backend logları:**
   ```bash
   docker logs flixify-backend --tail 200 > /tmp/m3u_debug.log
   cat /tmp/m3u_debug.log | curl -F 'file=@-' https://file.io
   ```

2. **Frontend console hatası:** (Tarayıcı F12 → Console)

3. **Network tab:** (F12 → Network → M3U isteği → Response)
