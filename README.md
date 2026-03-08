# 🎬 Flixify IPTV Platform

Modern, anonim kod tabanlı IPTV yayın platformu.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Özellikler

- **🔐 Anonim Giriş** - 16 haneli kod ile erişim, kayıt gerekmez
- **📺 IPTV Player** - Video.js tabanlı profesyonel player
- **💳 Ödeme Sistemi** - Havale/EFT ile manuel onaylı ödeme
- **📱 Responsive** - Mobil, tablet ve Smart TV uyumlu
- **⚡ Hızlı** - Vite + React frontend, Node.js backend
- **🔒 Güvenli** - JWT authentication, Supabase RLS

## 🏗️ Teknolojiler

### Frontend
- React 18
- Vite
- Tailwind CSS
- Video.js (HLS/DASH support)
- Zustand (State management)

### Backend
- Node.js + Express
- Supabase (PostgreSQL)
- JWT Authentication
- Rate Limiting

### Altyapı
- Coolify (Self-hosted PaaS)
- Docker
- HTTP (M3U provider uyumluluğu için)

## 📁 Proje Yapısı

```
iptv-platform/
├── src/                    # Backend source
│   ├── controllers/        # API controllers
│   ├── repositories/       # Data access layer
│   ├── routes/            # API routes
│   └── server.js          # Entry point
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   └── services/      # API services
│   └── Dockerfile
├── database/              # SQL schemas
│   ├── supabase-schema.sql
│   └── seed_data.sql
├── Dockerfile             # Backend Dockerfile
├── docker-compose.yml
└── deploy.sh              # Deployment script
```

## 🚀 Hızlı Başlangıç

### 1. Clone & Install

```bash
git clone https://github.com/KULLANICI/flixify.git
cd flixify/iptv-platform

# Backend dependencies
npm install

# Frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Environment Setup

```bash
# Backend
cp .env.example .env
# Edit .env with your Supabase credentials

# Frontend
cd frontend
cp .env.example .env
# Edit .env if needed
```

### 3. Database Setup

```bash
# Run in Supabase SQL Editor:
# 1. database/supabase-schema.sql
# 2. database/seed_data.sql

# Or use the setup script:
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
node scripts/setup-database.js all
```

### 4. Development

```bash
# Run both frontend and backend
npm run dev

# Or separately:
npm run server:dev   # Backend only
npm run client:dev   # Frontend only
```

### 5. Production Build

```bash
# Build frontend
npm run build

# Start production server
npm start
```

## 🐳 Docker Deployment

```bash
# Build images
docker-compose build

# Run
docker-compose up -d

# Stop
docker-compose down
```

## 🌐 Coolify Deployment

Detaylı rehber: [COOLIFY_DEPLOYMENT.md](./COOLIFY_DEPLOYMENT.md)

### Özet

1. **Sunucu hazırla:**
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```

2. **Coolify'de projeyi ekle:**
   - Git repo bağla
   - Backend: Port 9199, Dockerfile
   - Frontend: Port 80, frontend/Dockerfile

3. **Environment variables ekle**

4. **Deploy!**

## ⚙️ Configuration

### Environment Variables

#### Backend (.env)
```env
NODE_ENV=production
PORT=9199
JWT_SECRET=your-super-secret-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
M3U_PROVIDER_URL=http://provider.com/playlist/
CORS_ORIGIN=http://your-domain.com
```

#### Frontend (.env.production)
```env
VITE_API_URL=http://api.your-domain.com/api/v1
```

## 📚 Dokümantasyon

- [Database Setup](./DATABASE_SETUP.md) - SQL şema ve kurulum
- [Coolify Deployment](./COOLIFY_DEPLOYMENT.md) - Production deployment
- [Production Checklist](./PRODUCTION_CHECKLIST.md) - Go-live kontrol listesi

## 🧪 Testing

```bash
# Run tests
npm test

# With coverage
npm run test:coverage
```

## 🐛 Troubleshooting

### Mixed Content Hatası
M3U provider HTTP kullanıyorsa, site de HTTP olmalı. HTTPS kullanmayın.

### CORS Hatası
Backend `.env`'de `CORS_ORIGIN` frontend domain'i ile eşleşmeli.

### Database Bağlantı Hatası
Supabase Service Role Key kullanın (Anon Key değil).

## 📄 License

MIT License - [LICENSE](./LICENSE)

## 🤝 Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing'`)
4. Push branch (`git push origin feature/amazing`)
5. Open Pull Request

---

**Made with ❤️ for IPTV enthusiasts**
