const { sql } = require("../config/db-config");

async function addPreparationTime() {
  try {
    console.log("🔄 Orders tablosuna preparation_time kolonu ekleniyor...");

    // Add preparation_time column if it doesn't exist
    await sql`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS preparation_time INTEGER DEFAULT 0;
    `;
    console.log("✅ 'preparation_time' kolonu eklendi.");

    // Update existing records to have default preparation time
    await sql`
      UPDATE orders 
      SET preparation_time = 0 
      WHERE preparation_time IS NULL;
    `;
    console.log("✅ Mevcut kayıtların 'preparation_time' değerleri güncellendi.");

    console.log("✅ Orders tablosu preparation_time kolonu başarıyla eklendi!");
  } catch (error) {
    console.error("❌ Orders preparation_time kolonu eklenirken hata:", error);
    throw error;
  }
}

module.exports = { addPreparationTime };

// Eğer bu dosya doğrudan çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
  addPreparationTime()
    .then(() => {
      console.log("Migration tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration hatası:", error);
      process.exit(1);
    });
} 