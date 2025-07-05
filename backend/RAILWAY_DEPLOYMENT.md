# Railway Deployment Rehberi

Bu rehber, Kurye uygulaması backend'ini Railway'de deploy etmek için gerekli adımları açıklar.

## Gerekli Adımlar

### 1. Railway'e Proje Yükleme
1. [Railway.app](https://railway.app)'e giriş yapın
2. "New Project" → "Deploy from GitHub repo" seçin
3. Bu repo'yu seçin ve backend klasörünü root olarak ayarlayın

### 2. Environment Variables Ayarlama
Railway dashboard'da aşağıdaki environment variables'ları ayarlayın:

#### Zorunlu Variables:
```bash
DATABASE_URL=postgres://username:password@host/database?sslmode=require
JWT_SECRET=your_secure_jwt_secret_here
NODE_ENV=production
```

#### İsteğe Bağlı Variables:
```bash
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=secure_admin_password
REMOTE_API_HOST=your-app-name.railway.app
USE_REMOTE=true
```

### 3. Database Kurulumu
1. Railway'de PostgreSQL database oluşturun:
   - Dashboard → "New" → "Database" → "PostgreSQL"
2. Database URL'ini kopyalayın ve `DATABASE_URL` variable'ına ekleyin

### 4. JWT Secret Oluşturma
Güvenli bir JWT secret oluşturmak için:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Deploy Ayarları
- **Build Command**: `npm install` (otomatik)
- **Start Command**: `npm start` (otomatik)
- **Port**: Railway otomatik olarak atar
- **Health Check**: `/health` endpoint'i kullanılır

## Önemli Notlar

1. **Database Migrations**: İlk deploy'da otomatik olarak çalışır
2. **File Uploads**: Railway'de uploads klasörü geçici, kalıcı storage için AWS S3 öneririz
3. **Logs**: Railway dashboard'dan real-time logları izleyebilirsiniz
4. **Environment**: Production ortamında loglar azaltılmıştır

## Deployment Sonrası Test

Deploy sonrası aşağıdaki endpoint'leri test edin:
- `https://your-app.railway.app/health` - Server durumu
- `https://your-app.railway.app/api/db-health` - Database durumu

## Troubleshooting

**Database bağlantı hatası**: DATABASE_URL'nin doğru format'ta olduğundan emin olun
**JWT hatası**: JWT_SECRET'in ayarlandığından emin olun
**Upload hatası**: Dosya yükleme için S3 konfigürasyonu gerekebilir

## Support

Herhangi bir sorun yaşarsanız Railway loglarını kontrol edin:
```bash
railway logs
``` 