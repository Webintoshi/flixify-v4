# Production Deployment Guide

## Sunucu Seçenekleri

### 1. Render.com (Ücretsiz)
1. https://render.com'a git
2. "New Web Service" → GitHub repo bağla
3. Build Command: `npm install && cd frontend && npm install && npm run build`
4. Start Command: `npm start`
5. Environment Variables ekle (.env.production içeriği)

### 2. Railway.app (Ücretsiz)
1. https://railway.app'e git
2. "New Project" → GitHub'dan deploy
3. Environment Variables ekle
4. Otomatik deploy

### 3. VPS (DigitalOcean, Vultr, vs)
```bash
# Sunucuya SSH ile bağlan
ssh root@YOUR_SERVER_IP

# Node.js kur
apt update && apt install -y nodejs npm

# Proje dosyalarını kopyala (scp veya git clone)
git clone https://github.com/YOUR_REPO/iptv-platform.git
cd iptv-platform

# Dependencies kur
npm install
cd frontend && npm install && npm run build && cd ..

# .env.production dosyasını düzenle
nano .env.production

# Production başlat
npm start
```

## Frontend Build
```bash
cd frontend
npm run build
# Build çıktısı: ../dist/frontend/
```

## PM2 ile Sürekli Çalıştırma (Production)
```bash
npm install -g pm2
pm2 start src/server.js --name "iptv-platform"
pm2 save
pm2 startup
```

## Nginx Reverse Proxy (Önerilen)
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com;

    location / {
        proxy_pass http://localhost:9199;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## SSL (Let's Encrypt)
```bash
certbot --nginx -d YOUR_DOMAIN.com
```
