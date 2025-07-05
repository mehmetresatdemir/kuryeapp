const { sql } = require('../config/db-config');

async function createAdminSettingsTable() {
  try {
    console.log("🔧 Admin ayarlar tablosu oluşturuluyor...");

    // Admin_settings tablosunu oluştur
    await sql`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    console.log("✅ Admin_settings tablosu başarıyla oluşturuldu.");

    // Varsayılan saat ayarları kaldırıldı - veritabanı artık Europe/Istanbul timezone'unu kullanıyor

  } catch (error) {
    console.error("❌ Admin_settings tablosu oluşturulurken hata:", error);
    throw error;
  }
}

module.exports = createAdminSettingsTable; 