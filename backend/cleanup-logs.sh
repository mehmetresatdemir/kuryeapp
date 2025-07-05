#!/bin/bash

# Kurye App - Log Cleanup Script
# Bu script otomatik olarak log dosyalarını temizler

LOG_DIR="./logs"
MAX_LOG_SIZE="50M"
MAX_LOG_AGE="7" # days

echo "🧹 Starting log cleanup..."

# Backend logs directory'sinde isek
if [ -d "$LOG_DIR" ]; then
    # 50MB'dan büyük log dosyalarını sil
    find "$LOG_DIR" -name "*.log" -size +$MAX_LOG_SIZE -delete
    echo "✅ Large log files cleaned"
    
    # 7 günden eski log dosyalarını sil
    find "$LOG_DIR" -name "*.log" -mtime +$MAX_LOG_AGE -delete
    echo "✅ Old log files cleaned"
fi

# Root directory'deki server.log'u temizle
if [ -f "server.log" ]; then
    if [ $(stat -f%z "server.log" 2>/dev/null || stat -c%s "server.log" 2>/dev/null) -gt 52428800 ]; then
        rm -f server.log
        echo "✅ Large server.log removed"
    fi
fi

# PM2 logs'u temizle
if command -v pm2 &> /dev/null; then
    pm2 flush
    echo "✅ PM2 logs flushed"
fi

echo "🎉 Log cleanup completed!"

# Disk kullanımını göster
if [ -d "$LOG_DIR" ]; then
    echo "📊 Current logs directory size:"
    du -sh "$LOG_DIR" 2>/dev/null || echo "  0B"
fi 