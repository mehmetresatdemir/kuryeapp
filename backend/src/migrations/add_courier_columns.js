const { sql } = require("../config/db-config");

async function addCourierColumns() {
  try {
    console.log("🔄 Couriers tablosuna eksik kolonlar ekleniyor...");

    // Add missing columns to couriers table
    await sql`
      ALTER TABLE couriers 
      ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS password_hash TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `;
    console.log("✅ Eksik kolonlar eklendi.");

    // Update existing records to have updated_at = created_at if updated_at is null
    await sql`
      UPDATE couriers 
      SET updated_at = created_at 
      WHERE updated_at IS NULL;
    `;
    console.log("✅ Mevcut kayıtların 'updated_at' değerleri güncellendi.");

    console.log("✅ Couriers tablosu eksik kolonları başarıyla eklendi!");
  } catch (error) {
    console.error("❌ Couriers eksik kolonları eklenirken hata:", error);
    throw error;
  }
}

module.exports = { addCourierColumns };

// Eğer bu dosya doğrudan çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
  addCourierColumns()
    .then(() => {
      console.log("Migration tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration hatası:", error);
      process.exit(1);
    });
} 