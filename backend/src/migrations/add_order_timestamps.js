const { sql } = require("../config/db-config");

async function addOrderTimestamps() {
  try {
    console.log("🔄 Orders tablosuna timestamp kolonları ekleniyor...");

    // Add updated_at column if it doesn't exist
    await sql`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `;
    console.log("✅ 'updated_at' kolonu eklendi.");

    // Add delivered_at column if it doesn't exist
    await sql`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    `;
    console.log("✅ 'delivered_at' kolonu eklendi.");

    // Update existing records to have updated_at = created_at if updated_at is null
    await sql`
      UPDATE orders 
      SET updated_at = created_at 
      WHERE updated_at IS NULL;
    `;
    console.log("✅ Mevcut kayıtların 'updated_at' değerleri güncellendi.");

    console.log("✅ Orders tablosu timestamp kolonları başarıyla eklendi!");
  } catch (error) {
    console.error("❌ Orders timestamp kolonları eklenirken hata:", error);
    throw error;
  }
}

module.exports = { addOrderTimestamps };

// Eğer bu dosya doğrudan çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
  addOrderTimestamps()
    .then(() => {
      console.log("Migration tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration hatası:", error);
      process.exit(1);
    });
} 