const { sql } = require('../config/db-config');

const createNotificationSoundsTable = async () => {
    try {
        // Check if table exists
        const tableExists = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'notification_sounds'
            )
        `;

        if (tableExists[0].exists) {
            console.log('✅ Bildirim sesleri tablosu zaten mevcut.');
        } else {
            // Create the table
            await sql`
                CREATE TABLE notification_sounds (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    file_path VARCHAR(500) NOT NULL,
                    file_size INTEGER,
                    file_type VARCHAR(50),
                    duration FLOAT,
                    is_active BOOLEAN DEFAULT false,
                    is_default BOOLEAN DEFAULT false,
                    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            console.log('✅ Bildirim sesleri tablosu başarıyla oluşturuldu.');

            // Insert default notification sound
            await sql`
                INSERT INTO notification_sounds (name, file_path, is_active, is_default)
                VALUES ('Varsayılan Bildirim Sesi', '/sounds/default-notification.mp3', true, true)
            `;
            console.log('✅ Varsayılan bildirim sesi eklendi.');
        }

        // Create indexes for better performance
        try {
            await sql`
                CREATE INDEX IF NOT EXISTS idx_notification_sounds_active 
                ON notification_sounds(is_active);
            `;
            
            await sql`
                CREATE INDEX IF NOT EXISTS idx_notification_sounds_default 
                ON notification_sounds(is_default);
            `;
            
            console.log('✅ Bildirim sesleri tablosu indeksleri oluşturuldu.');
        } catch (indexError) {
            console.log('⚠️ İndeks oluşturma hatası (muhtemelen zaten mevcut):', indexError.message);
        }

    } catch (error) {
        console.error('❌ Bildirim sesleri tablosu oluşturulurken hata:', error);
        throw error;
    }
};

module.exports = { createNotificationSoundsTable }; 