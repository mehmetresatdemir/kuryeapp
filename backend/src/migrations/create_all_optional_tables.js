const { sql } = require('../config/db-config');
const fs = require('fs');
const path = require('path');

const createAllOptionalTables = async () => {
    try {
        console.log('🔧 İsteğe bağlı tablolar oluşturuluyor...');

        // 1. Admin Settings Table
        await sql`
            CREATE TABLE IF NOT EXISTS admin_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(255) UNIQUE NOT NULL,
                setting_value JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `;

        // 2. Preference System Tables
        await sql`
            CREATE TABLE IF NOT EXISTS courier_restaurant_preferences (
                id SERIAL PRIMARY KEY,
                courier_id BIGINT NOT NULL,
                restaurant_id BIGINT NOT NULL,
                is_selected BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                FOREIGN KEY (courier_id) REFERENCES couriers(id) ON DELETE CASCADE,
                FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
                UNIQUE(courier_id, restaurant_id)
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS restaurant_courier_preferences (
                id SERIAL PRIMARY KEY,
                restaurant_id BIGINT NOT NULL,
                courier_id BIGINT NOT NULL,
                is_selected BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
                FOREIGN KEY (courier_id) REFERENCES couriers(id) ON DELETE CASCADE,
                UNIQUE(restaurant_id, courier_id)
            )
        `;

        // Add preference mode columns
        await sql`
            ALTER TABLE couriers 
            ADD COLUMN IF NOT EXISTS notification_mode VARCHAR(20) DEFAULT 'all_restaurants'
            CHECK (notification_mode IN ('all_restaurants', 'selected_restaurants'))
        `;

        await sql`
            ALTER TABLE restaurants 
            ADD COLUMN IF NOT EXISTS courier_visibility_mode VARCHAR(20) DEFAULT 'all_couriers'
            CHECK (courier_visibility_mode IN ('all_couriers', 'selected_couriers'))
        `;

        // 3. Notification Sounds Table
        await sql`
            CREATE TABLE IF NOT EXISTS notification_sounds (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                file_path VARCHAR(500) NOT NULL UNIQUE,
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

        // 4. Push Tokens Table
        await sql`
            CREATE TABLE IF NOT EXISTS push_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('restaurant', 'courier')),
                token TEXT NOT NULL,
                platform VARCHAR(20) DEFAULT 'unknown',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(user_id, user_type)
            )
        `;

        // 5. Admin Notifications Table
        await sql`
            CREATE TABLE IF NOT EXISTS admin_notifications (
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
                metadata JSONB
            )
        `;

        // Create all indexes
        await sql`
            CREATE INDEX IF NOT EXISTS idx_courier_restaurant_prefs_courier 
            ON courier_restaurant_preferences(courier_id, is_selected)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_restaurant_courier_prefs_restaurant 
            ON restaurant_courier_preferences(restaurant_id, is_selected)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_notification_sounds_active 
            ON notification_sounds(is_active)
        `;
        
        await sql`
            CREATE INDEX IF NOT EXISTS idx_notification_sounds_default 
            ON notification_sounds(is_default)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_push_tokens_user 
            ON push_tokens(user_id, user_type, is_active)
        `;
        
        await sql`
            CREATE INDEX IF NOT EXISTS idx_push_tokens_type_active 
            ON push_tokens(user_type, is_active)
        `;
        
        await sql`
            CREATE INDEX IF NOT EXISTS idx_push_tokens_token 
            ON push_tokens(token)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_admin_notifications_type_created 
            ON admin_notifications(type, created_at DESC)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_admin_notifications_priority 
            ON admin_notifications(priority, created_at DESC)
        `;

        // Set default notification sound
        const soundPath = '/sounds/default-notification.wav';
        const fullPath = path.join(__dirname, '../../public', soundPath);
        const frontendSoundPath = path.join(__dirname, '../../../assets/sounds/default-notification.wav');
        const backendSoundsDir = path.join(__dirname, '../../public/sounds');
        
        if (!fs.existsSync(backendSoundsDir)) {
            fs.mkdirSync(backendSoundsDir, { recursive: true });
        }
        
        if (fs.existsSync(frontendSoundPath)) {
            try {
                fs.copyFileSync(frontendSoundPath, fullPath);
            } catch (copyError) {
                // Ses dosyası kopyalanamadı
            }
        }
        
        // Insert default notification sound if not exists
        const existingSound = await sql`
            SELECT id FROM notification_sounds WHERE file_path = ${soundPath} LIMIT 1
        `;
        
        if (existingSound.length === 0) {
            await sql`
                INSERT INTO notification_sounds (name, file_path, file_size, file_type, is_active, is_default)
                VALUES (
                    'Varsayılan Bildirim Sesi', 
                    ${soundPath}, 
                    ${fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0}, 
                    'audio/wav', 
                    true, 
                    true
                )
            `;
        } else {
            await sql`
                UPDATE notification_sounds 
                SET is_default = true, is_active = true, name = 'Varsayılan Bildirim Sesi'
                WHERE file_path = ${soundPath}
            `;
        }

        console.log('✅ İsteğe bağlı tablolar başarıyla oluşturuldu');
        
    } catch (error) {
        console.error('❌ İsteğe bağlı tablolar oluşturulurken hata:', error);
        throw error;
    }
};

module.exports = createAllOptionalTables; 