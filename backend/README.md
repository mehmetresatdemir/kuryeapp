# 🚚 Kurye App Backend Server

## 🚀 Kurulum ve Çalıştırma

### 1. Gereksinimler
- Node.js 16+ 
- NPM 8+
- PM2 (Production için)

### 2. Kurulum
```bash
npm install
```

### 3. Çalıştırma

#### Development (Geliştirme)
```bash
npm run dev
```

#### Production (Üretim)
```bash
npm start
```

#### Admin Panel ile Beraber
```bash
npm run admin
```

#### PM2 ile Production
```bash
npm run pm2:start
```

## 🔧 Yapılandırma

### Environment Variables (.env)
```env
DATABASE_URL=postgres://user:pass@host/db
PORT=3000
NODE_ENV=production
API_HOST=0.0.0.0
JWT_SECRET=your-secret-key
GOOGLE_MAPS_API_KEY=your-api-key
```

## 📍 API Endpoints

### Ana Endpoints
- `GET /health` - Sunucu durumu
- `GET /api/health` - Detaylı sağlık kontrolü

### Sipariş Yönetimi
- `GET /api/orders/status` - Sipariş durumları
- `POST /api/orders` - Yeni sipariş
- `PUT /api/orders/:id/status` - Sipariş durumu güncelleme

### Kurye Yönetimi
- `GET /api/couriers` - Tüm kuryeler
- `POST /api/couriers/login` - Kurye girişi
- `PUT /api/couriers/presence/:id` - Kurye konum güncelleme

### Restoran Yönetimi
- `GET /api/restaurants` - Tüm restoranlar
- `POST /api/restaurants/login` - Restoran girişi
- `GET /api/restaurants/neighborhoods` - Teslimat alanları

### Kazanç Raporları
- `GET /api/earnings` - Genel kazanç özeti (Admin)
- `GET /api/earnings/monthly/:courierId` - Kurye aylık kazanç
- `GET /api/earnings/delivered/:courierId` - Kurye teslim edilen siparişler

## 🖥️ Admin Panel

Admin paneli `http://localhost:3000` adresinde çalışır.

### Sayfalar
- `/admin-dashboard.html` - Ana dashboard
- `/admin-orders.html` - Sipariş yönetimi
- `/admin-couriers.html` - Kurye yönetimi
- `/admin-restaurants.html` - Restoran yönetimi
- `/admin-earnings.html` - Kazanç raporları

## 🔄 PM2 Komutları

```bash
# Servisi başlat
npm run pm2:start

# Servisi yeniden başlat
npm run pm2:restart

# Servisi durdur
npm run pm2:stop

# Servisi sil
npm run pm2:delete

# Logları görüntüle
npm run pm2:logs

# Servis durumu
npm run pm2:status
```

## 📂 Klasör Yapısı

```
backend/
├── src/
│   ├── config/         # Veritabanı yapılandırması
│   ├── controllers/    # İş mantığı
│   ├── routes/         # API rotaları
│   ├── middleware/     # Middleware'ler
│   ├── services/       # Servisler
│   ├── migrations/     # Veritabanı migrasyonları
│   └── utils/          # Yardımcı fonksiyonlar
├── public/             # Admin panel dosyaları
├── logs/               # Log dosyaları
├── uploads/            # Yüklenen dosyalar
└── admin-server.js     # Admin panel server'ı
```

## 🐛 Sorun Giderme

### Port Kullanımda Hatası
```bash
lsof -ti:3000 | xargs kill -9
```

### PM2 Servis Yeniden Başlatma
```bash
pm2 restart kurye-backend
```

### Veritabanı Bağlantı Hatası
- `.env` dosyasındaki `DATABASE_URL`'i kontrol edin
- Veritabanı sunucusunun çalıştığından emin olun

## 🔐 Güvenlik

- JWT token'ları güvenli şekilde saklanır
- CORS politikaları yapılandırılmıştır
- Input validation middleware'leri aktiftir

## 📝 Notlar

- Development modunda detaylı loglar gösterilir
- Production modunda hata detayları gizlenir
- Admin panel static dosyalar olarak serve edilir
- Socket.IO real-time bağlantılar için kullanılır

## �� Optimizasyon Özellikleri

### Log Yönetimi
- **Production modda** console.log'lar otomatik olarak devre dışı
- **PM2 log rotation** ile disk alanı korunuyor
- **Otomatik log temizleme** scriptleri mevcut

### Performance
- **Memory limits** ile RAM kullanımı kontrol altında
- **Connection pooling** ile veritabanı optimize
- **Socket.IO optimizations** Raspberry Pi için ayarlandı

### Log Temizleme Komutları
```bash
# Manuel log temizleme
npm run clean-logs

# Tüm optimizasyon (logs + PM2 flush)
npm run optimize

# PM2 loglarını görüntüle
npm run logs
```

## 🛠️ Yönetim Komutları

### Development
```bash
npm run dev          # Development server
npm run admin:dev    # Admin server (dev mode)
```

### Production
```bash
npm run production   # PM2 ile production start
npm run stop         # PM2 durdur
npm run restart      # PM2 yeniden başlat
npm run monitor      # PM2 monitoring
```

### Deployment
```bash
./deploy.sh          # Otomatik deployment
```

## 📊 Monitoring

### Health Checks
- `/health` - Temel sağlık kontrolü
- `/api/db-health` - Veritabanı sağlık kontrolü
- `/api/connection-status` - Detaylı sistem durumu

### Log Monitoring
```bash
pm2 logs kurye-backend          # Canlı loglar
pm2 logs kurye-backend --lines 100  # Son 100 satır
pm2 flush                       # Tüm logları temizle
```

## 🐛 Troubleshooting

### Yüksek Disk Kullanımı
```bash
# Log dosyalarını kontrol et
du -sh logs/
du -sh ~/.pm2/logs/

# Logları temizle
npm run clean-logs
pm2 flush
```

### Memory Issues
```bash
# Memory kullanımını kontrol et
pm2 monit

# Restart ile memory temizle
pm2 restart kurye-backend
```

### Database Connection
```bash
# DB durumunu kontrol et
curl http://localhost:3000/api/db-health
```

## 🔒 Güvenlik

- JWT token authentication
- CORS protection
- Rate limiting (production)
- Input validation
- SQL injection protection

## 📁 Klasör Yapısı

```
backend/
├── src/
│   ├── config/         # Veritabanı ve yapılandırma
│   ├── controllers/    # İş mantığı
│   ├── middleware/     # Middleware fonksiyonları
│   ├── routes/         # API rotaları
│   ├── services/       # Servis katmanı
│   ├── sockets/        # Socket.IO handlers
│   └── utils/          # Yardımcı fonksiyonlar
├── public/             # Admin panel static files
├── uploads/            # Yüklenen dosyalar
├── logs/              # Log dosyaları (production'da devre dışı)
└── ecosystem.config.js # PM2 konfigürasyonu
```

## 🚨 Önemli Notlar

- **Production'da log dosyaları `/dev/null`'a yönlendiriliyor**
- **Memory limit 1GB** olarak ayarlandı
- **Auto-restart** crash durumunda aktif
- **Socket connections** Raspberry Pi için optimize edildi

## 📞 Destek

Herhangi bir sorun için:
1. Önce `npm run logs` ile logları kontrol edin
2. `curl http://localhost:3000/health` ile sistem durumunu kontrol edin
3. Gerekirse `npm run restart` ile servisi yeniden başlatın # kuryebanckend
