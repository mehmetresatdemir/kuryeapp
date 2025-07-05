const { sql } = require('../config/db-config');

const createPreferenceSystem = async () => {
    try {
        console.log('🔧 Tercih sistemi tabloları oluşturuluyor...');

        // Kuryeler için restaurant tercihleri tablosu
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

        // Restoranlar için courier tercihleri tablosu
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

        // Kuryeler için tercih modu (tüm restoranlar vs seçililer)
        await sql`
            ALTER TABLE couriers 
            ADD COLUMN IF NOT EXISTS notification_mode VARCHAR(20) DEFAULT 'all_restaurants'
            CHECK (notification_mode IN ('all_restaurants', 'selected_restaurants'))
        `;

        // Restoranlar için tercih modu (tüm kuryeler vs seçililer)
        await sql`
            ALTER TABLE restaurants 
            ADD COLUMN IF NOT EXISTS courier_visibility_mode VARCHAR(20) DEFAULT 'all_couriers'
            CHECK (courier_visibility_mode IN ('all_couriers', 'selected_couriers'))
        `;

        // İndeksler oluştur
        await sql`
            CREATE INDEX IF NOT EXISTS idx_courier_restaurant_prefs_courier 
            ON courier_restaurant_preferences(courier_id, is_selected)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_restaurant_courier_prefs_restaurant 
            ON restaurant_courier_preferences(restaurant_id, is_selected)
        `;

        console.log('✅ Tercih sistemi tabloları başarıyla oluşturuldu.');
        
    } catch (error) {
        console.error('❌ Tercih sistemi tabloları oluşturulurken hata:', error);
        throw error;
    }
};

module.exports = createPreferenceSystem; 