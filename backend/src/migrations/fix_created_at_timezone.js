const { sql } = require('../config/db-config');

async function fixCreatedAtTimezone() {
  try {
    console.log("🔧 Orders tablosundaki created_at kolonunu TIMESTAMPTZ yapmak için düzeltiliyor...");

    // created_at kolonunu TIMESTAMPTZ yap
    await sql`
      ALTER TABLE orders 
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Europe/Istanbul'
    `;
    console.log("✅ 'created_at' kolonu TIMESTAMPTZ olarak güncellendi.");

    // Varsayılan değeri Turkey timezone NOW() yap
    await sql`
      ALTER TABLE orders 
      ALTER COLUMN created_at SET DEFAULT timezone('Europe/Istanbul', NOW())
    `;
    console.log("✅ 'created_at' kolonu varsayılan değeri NOW() olarak ayarlandı.");

    console.log("✅ Created_at timezone düzeltmesi tamamlandı!");
  } catch (error) {
    console.error("❌ Created_at timezone düzeltmesi hatası:", error);
    throw error;
  }
}

module.exports = { fixCreatedAtTimezone };

// Eğer bu dosya doğrudan çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
  fixCreatedAtTimezone()
    .then(() => {
      console.log("Migration tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration hatası:", error);
      process.exit(1);
    });
} 