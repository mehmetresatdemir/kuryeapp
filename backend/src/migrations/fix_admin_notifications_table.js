const { sql } = require('../config/db-config');

const fixAdminNotificationsTable = async () => {
    try {
        console.log('🔧 Admin bildirim tablosunu düzeltiliyor...');

        // Eski tabloyu yedekle
        await sql`
            CREATE TABLE IF NOT EXISTS admin_notifications_backup AS 
            SELECT * FROM admin_notifications
        `;

        // Yeni tablo yapısını oluştur
        await sql`
            DROP TABLE IF EXISTS admin_notifications CASCADE
        `;

        await sql`
            CREATE TABLE admin_notifications (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
                user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('restaurant', 'courier')),
                user_id INTEGER NULL, -- NULL means broadcast to all users of that type
                is_read BOOLEAN DEFAULT false,
                data JSONB NULL, -- Extra data for the notification
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        console.log('✅ Admin bildirim tablosu başarıyla düzeltildi.');

        // İndeks oluştur
        await sql`
            CREATE INDEX IF NOT EXISTS idx_admin_notifications_user 
            ON admin_notifications(user_type, user_id, is_read, created_at DESC)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread 
            ON admin_notifications(user_type, is_read, created_at DESC)
        `;

        console.log('✅ Admin bildirim tablosu indeksleri oluşturuldu.');

        // Test verisi ekle
        await sql`
            INSERT INTO admin_notifications (title, message, type, user_type, user_id, created_at, updated_at)
            VALUES 
            ('Hoş Geldiniz!', 'Bildirim sistemi başarıyla kuruldu.', 'success', 'courier', 1, NOW(), NOW()),
            ('Sistem Duyurusu', 'Tüm kuryeler için önemli duyuru.', 'info', 'courier', NULL, NOW(), NOW()),
            ('Restoran Bildirimi', 'Restoran için test bildirimi.', 'info', 'restaurant', 1, NOW(), NOW())
        `;

        console.log('✅ Test bildirimleri eklendi.');

    } catch (error) {
        console.error('❌ Admin bildirim tablosu düzeltilirken hata:', error);
        throw error;
    }
};

module.exports = fixAdminNotificationsTable; 