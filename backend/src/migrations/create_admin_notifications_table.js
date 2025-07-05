const { sql } = require('../config/db-config');

const createAdminNotificationsTable = async () => {
    try {
        console.log('🔧 Admin bildirim geçmişi tablosu oluşturuluyor...');

        // Önce mevcut tabloyu kontrol et
        const tableExists = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_notifications'
            )
        `;

        if (tableExists[0].exists) {
            console.log('📋 admin_notifications tablosu zaten mevcut, yapı kontrol ediliyor...');
            
            // priority kolonu var mı kontrol et
            const priorityColumnExists = await sql`
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'admin_notifications' AND column_name = 'priority'
                )
            `;

            if (!priorityColumnExists[0].exists) {
                console.log('🔧 priority kolonu eksik, ekleniyor...');
                await sql`
                    ALTER TABLE admin_notifications 
                    ADD COLUMN priority VARCHAR(20) DEFAULT 'normal' 
                    CHECK (priority IN ('normal', 'high', 'urgent'))
                `;
                console.log('✅ priority kolonu eklendi.');
            }
        } else {
            // Tablo yoksa oluştur
            await sql`
                CREATE TABLE admin_notifications (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR(20) NOT NULL CHECK (type IN ('couriers', 'restaurants')),
                    scope VARCHAR(20) NOT NULL CHECK (scope IN ('all', 'online', 'specific')),
                    title VARCHAR(100) NOT NULL,
                    message TEXT NOT NULL,
                    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
                    with_sound BOOLEAN DEFAULT true,
                    recipients_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    sent_by INTEGER DEFAULT NULL,
                    metadata JSONB -- Ekstra bilgiler için
                )
            `;
            console.log('✅ Admin bildirim geçmişi tablosu başarıyla oluşturuldu.');
        }

        // İndeks oluştur (varsa hata vermez)
        try {
            await sql`
                CREATE INDEX IF NOT EXISTS idx_admin_notifications_type_created 
                ON admin_notifications(type, created_at DESC)
            `;

            await sql`
                CREATE INDEX IF NOT EXISTS idx_admin_notifications_priority 
                ON admin_notifications(priority, created_at DESC)
            `;

            console.log('✅ Admin bildirim geçmişi indeksleri oluşturuldu.');
        } catch (indexError) {
            console.log('⚠️ İndeks oluşturma hatası (muhtemelen zaten mevcut):', indexError.message);
        }

    } catch (error) {
        console.error('❌ Admin bildirim geçmişi tablosu oluşturulurken hata:', error);
        throw error;
    }
};

module.exports = createAdminNotificationsTable; 