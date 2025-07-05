# Bursa-Go 🛵

Bursa için kurye ve teslimat uygulaması. React Native (Expo) ile geliştirilmiş modern bir kurye hizmeti platformu.

## Özellikler

- 📱 **Restoran Uygulaması**: Siparişlerin oluşturulması ve yönetimi
- 🛵 **Kurye Uygulaması**: Sipariş kabul etme ve teslimat süreci
- 🗺️ **Harita Entegrasyonu**: Google Maps ile gerçek zamanlı lokasyon takibi
- 💬 **Anlık Bildirimler**: Socket.io ile gerçek zamanlı iletişim
- 💳 **Ödeme Seçenekleri**: Nakit, kredi kartı ve hediye çeki desteği
- 📊 **Dashboard**: Kazanç takibi ve sipariş istatistikleri

## Kurulum

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

2. Backend'i başlatın:
   ```bash
   cd backend
   node index.js
   ```

3. Uygulamayı başlatın:
   ```bash
   npx expo start
   ```

## Kullanım

- **iOS Simulator**: `i` tuşuna basın
- **Android Emulator**: `a` tuşuna basın
- **Expo Go**: QR kodu tarayın

## Teknolojiler

- React Native (Expo)
- TypeScript
- Node.js & Express
- PostgreSQL (Neon)
- Socket.io
- Google Maps API
- Expo Notifications

## Proje Yapısı

```
/app          # React Native uygulama kodu
/backend      # Node.js backend servisi
/assets       # Resim ve icon dosyaları
/components   # Yeniden kullanılabilir bileşenler
/constants    # API endpoints ve sabitler
/types        # TypeScript type tanımları
```

## Lisans

Bu proje özel kullanım içindir.
