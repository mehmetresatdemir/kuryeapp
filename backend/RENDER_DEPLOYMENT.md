# Render.com Deployment Rehberi

Railway alternatifi olarak Render.com ücretsiz deployment rehberi.

## 🆓 Render.com Avantajları
- Gerçekten ücretsiz plan (kredi kartı gerektirmez)
- 750 saat/ay çalışma süresi
- Otomatik SSL sertifikası
- GitHub entegrasyonu

## 📋 Deployment Adımları

### 1. Render.com'a Kaydolun
1. [render.com](https://render.com) sitesine gidin
2. GitHub hesabınızla giriş yapın

### 2. Web Service Oluşturun
1. Dashboard'da "New" → "Web Service"
2. GitHub repo'nuzu seçin
3. Ayarları yapın:
   - **Name**: kurye-backend
   - **Root Directory**: backend
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 3. Environment Variables
Dashboard'da Environment sekmesinden ekleyin:

```bash
NODE_ENV=production
DATABASE_URL=postgres://username:password@host/database?sslmode=require
JWT_SECRET=your_secure_jwt_secret_here
PORT=10000
```

### 4. Database Seçenekleri

**A) Render PostgreSQL (Ücretsiz)**:
- Dashboard → "New" → "PostgreSQL"
- Database URL'ini kopyalayın

**B) Supabase (Ücretsiz)**:
- [supabase.com](https://supabase.com) hesabı oluşturun
- Database URL'ini alın

**C) Neon.tech (Ücretsiz)**:
- [neon.tech](https://neon.tech) hesabı oluşturun  
- Zaten Neon kullanıyorsanız mevcut URL'i kullanın

### 5. Deploy
- Ayarları kaydedin
- Otomatik build başlayacak
- Deploy URL'i: `https://kurye-backend.onrender.com`

## 🧪 Test
- `https://your-app.onrender.com/health`
- `https://your-app.onrender.com/api/db-health`

## ⚡ Diğer Ücretsiz Alternatifler

### Cyclic.sh
```bash
npm install -g @cyclic-sh/cli
cyclic deploy
```

### Koyeb
```bash
npm install -g @koyeb/cli
koyeb login
koyeb service create
```

## 📝 Notlar
- Render ücretsiz plan 30 gün sonra uyuyabilir
- İlk istek 1-2 dakika sürebilir (cold start)
- Production kullanım için paid plan önerilir 