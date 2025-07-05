#!/bin/bash

echo "🚀 Railway Deployment Script - Kurye Backend"
echo "============================================="

# Railway CLI kurulu mu kontrol et
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI bulunamadı!"
    echo "📦 Railway CLI kurmak için: npm install -g @railway/cli"
    echo "🔗 Veya: https://docs.railway.app/develop/cli#installing-the-cli"
    exit 1
fi

echo "✅ Railway CLI bulundu"

# Railway'e login kontrolü
echo "🔐 Railway login durumu kontrol ediliyor..."
if ! railway whoami &> /dev/null; then
    echo "❌ Railway'e giriş yapmadınız!"
    echo "🔐 Giriş yapmak için: railway login"
    exit 1
fi

echo "✅ Railway'e giriş yapılmış"

# Environment variables uyarısı
echo ""
echo "⚠️  UYARI: Railway deployment'dan önce aşağıdaki environment variables'ları ayarlamanız gerekiyor:"
echo ""
echo "Zorunlu:"
echo "  - DATABASE_URL (PostgreSQL veritabanı URL'i)"
echo "  - JWT_SECRET (Güvenli JWT secret key)"
echo "  - NODE_ENV=production"
echo ""
echo "İsteğe bağlı:"
echo "  - GOOGLE_MAPS_API_KEY"
echo "  - ADMIN_EMAIL"
echo "  - ADMIN_PASSWORD"
echo ""

read -p "Environment variables'ları ayarladınız mı? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Önce environment variables'ları ayarlayın"
    echo "🔧 Railway dashboard'dan variables ekleyebilirsiniz"
    exit 1
fi

# Deploy işlemi
echo ""
echo "🚀 Railway'e deploy ediliyor..."
echo ""

# Proje dizinine git
cd "$(dirname "$0")"

# Deploy et
if railway up; then
    echo ""
    echo "✅ Deployment başarılı!"
    echo ""
    echo "🔗 URL almak için: railway status"
    echo "📊 Logları görmek için: railway logs"
    echo "⚙️  Dashboard: https://railway.app/dashboard"
    echo ""
    echo "🧪 Test endpoint'leri:"
    echo "  - /health (Server durumu)"
    echo "  - /api/db-health (Database durumu)"
    echo ""
else
    echo ""
    echo "❌ Deployment başarısız!"
    echo "📊 Hata detayları için: railway logs"
    echo "🆘 Yardım için: railway help"
    exit 1
fi 