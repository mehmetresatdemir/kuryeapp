const { sql } = require('../config/db-config');

async function fixDefaultTimezoneV2() {
  try {
    console.log("🔧 Orders tablosundaki created_at varsayılan değerini AT TIME ZONE ile düzeltiliyor...");

    // created_at kolonunun varsayılan değerini AT TIME ZONE syntax ile yap
    await sql`
      ALTER TABLE orders 
      ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
    `;
    console.log("✅ 'created_at' kolonu varsayılan değeri AT TIME ZONE ile ayarlandı.");

    console.log("✅ Default timezone v2 düzeltmesi tamamlandı!");
  } catch (error) {
    console.error("❌ Default timezone v2 düzeltmesi hatası:", error);
    throw error;
  }
}

module.exports = { fixDefaultTimezoneV2 };

// Eğer bu dosya doğrudan çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
  fixDefaultTimezoneV2()
    .then(() => {
      console.log("Migration tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration hatası:", error);
      process.exit(1);
    });
} 