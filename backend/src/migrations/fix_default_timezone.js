const { sql } = require('../config/db-config');

async function fixDefaultTimezone() {
  try {
    console.log("🔧 Orders tablosundaki created_at varsayılan değerini Turkey timezone yapmak için düzeltiliyor...");

    // created_at kolonunun varsayılan değerini Turkey timezone NOW() yap
    await sql`
      ALTER TABLE orders 
      ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'Europe/Istanbul')
    `;
    console.log("✅ 'created_at' kolonu varsayılan değeri Turkey timezone NOW() olarak ayarlandı.");

    console.log("✅ Default timezone düzeltmesi tamamlandı!");
  } catch (error) {
    console.error("❌ Default timezone düzeltmesi hatası:", error);
    throw error;
  }
}

module.exports = { fixDefaultTimezone };

// Eğer bu dosya doğrudan çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
  fixDefaultTimezone()
    .then(() => {
      console.log("Migration tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration hatası:", error);
      process.exit(1);
    });
} 