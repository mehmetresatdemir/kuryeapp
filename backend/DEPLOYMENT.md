# 🚀 Kurye Backend Production Deployment Guide

## 📋 Ön Gereksinimler

### Sunucuda Bulunması Gerekenler:
- Node.js (v16 veya üzeri)
- npm veya yarn
- PM2 (process manager)
- Git (opsiyonel)

## 🔧 Hızlı Deployment

### 1. Sunucuya Dosyaları Yükle
Backend klasörünü sunucunuza yükleyin (FTP, SCP, vb. ile).

### 2. Otomatik Deployment Script'i Çalıştır
```bash
cd backend
chmod +x deploy.sh
./deploy.sh
```

## 📝 Manuel Deployment Adımları

### 1. Bağımlılıkları Yükle
```bash
npm install
```

### 2. Environment Variables'ı Ayarla
Production için `.env` dosyasını düzenleyin:
```bash
cp .env.production .env
# veya manuel olarak USE_REMOTE=true yapın
```

### 3. PM2 ile Başlat
```bash
# PM2'yi global olarak yükle (eğer yoksa)
npm install -g pm2

# Uygulamayı başlat
pm2 start ecosystem.config.js --env production

# PM2'yi sistem başlangıcında çalışacak şekilde ayarla
pm2 startup
pm2 save
```

## 🏠 Port ve IP Yapılandırması

### Backend (Sunucu Tarafı)
- **Host**: `0.0.0.0` (tüm IP adreslerinden erişime izin verir)
- **Port**: `3000` (varsayılan, değiştirilebilir)
- **URL**: `http://sunucu-ip:3000` veya `https://domain.com`

### Frontend (Client Tarafı)
Frontend `constants/api.ts` dosyasında:
- `USE_REMOTE=true` olarak ayarlanmalı
- `REMOTE_URL` doğru domain/IP'yi göstermeli

## 🔍 Sorun Giderme

### 1. Uygulama Çalışmıyor mu?
```bash
# PM2 durumunu kontrol et
pm2 status

# Logları incele
pm2 logs kurye-backend

# Uygulamayı yeniden başlat
pm2 restart kurye-backend
```

### 2. Veritabanı Bağlantı Sorunu
```bash
# Veritabanı health check
curl http://localhost:3000/api/db-health
```

### 3. Port Erişim Sorunu
```bash
# Port dinlenip dinlenmediğini kontrol et
netstat -tlnp | grep :3000

# Firewall ayarları (Ubuntu/Debian)
sudo ufw allow 3000
```

### 4. HTTPS Sorunu
Eğer HTTPS kullanıyorsanız:
- SSL sertifikası geçerli olmalı
- `constants/api.ts` dosyasında `https://` kullanın
- Reverse proxy (nginx) yapılandırması gerekebilir

## 📊 İzleme Komutları

```bash
# Uygulama durumu
pm2 status

# Canlı loglar
pm2 logs kurye-backend --follow

# Memory/CPU kullanımı
pm2 monit

# Uygulamayı durdur
pm2 stop kurye-backend

# Uygulamayı sil
pm2 delete kurye-backend
```

## 🌐 Nginx Reverse Proxy (Opsiyonel)

Nginx kullanıyorsanız örnek yapılandırma:

```nginx
server {
    listen 80;
    server_name red.enucuzal.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔐 Güvenlik Notları

1. `.env` dosyasındaki hassas bilgileri koruyun
2. JWT_SECRET'ı güçlü tutun
3. Firewall ayarlarını kontrol edin
4. HTTPS kullanmayı tercih edin
5. Database erişimini sınırlayın

## ⚡ Performans Optimizasyonu

1. PM2 cluster mode kullanın (çoklu CPU için)
2. Redis cache ekleyin
3. Database connection pooling kullanın
4. Static dosyalar için CDN kullanın

## 📞 Destek

Sorun yaşarsanız:
1. PM2 loglarını kontrol edin
2. Database bağlantısını test edin
3. Port ve firewall ayarlarını kontrol edin
4. Environment variables'ları doğrulayın 