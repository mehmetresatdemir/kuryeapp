const { sql } = require("../config/db-config");

async function addMoreCourierDetails() {
  try {
    console.log("🔄 Couriers tablosuna ek kurye detay kolonları ekleniyor...");

    await sql`
      ALTER TABLE couriers 
      ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS phone_number TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'motorcycle',
      ADD COLUMN IF NOT EXISTS license_plate TEXT,
      ADD COLUMN IF NOT EXISTS delivery_capacity INTEGER DEFAULT 1;
    `;
    console.log("✅ Ek kurye detay kolonları başarıyla eklendi.");
  } catch (error) {
    console.error("❌ Couriers tablosuna ek kolonlar eklenirken hata:", error);
    throw error;
  }
}

module.exports = { addMoreCourierDetails };

// Eğer bu dosya doğrudan çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
  addMoreCourierDetails()
    .then(() => {
      console.log("Migration tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration hatası:", error);
      process.exit(1);
    });
} 