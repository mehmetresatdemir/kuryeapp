const { sql } = require("../config/db-config");

async function dropOldPasswordColumn() {
  try {
    console.log("🔄 'couriers' tablosundan eski 'password' sütunu kaldırılıyor...");

    await sql`
      ALTER TABLE couriers
      DROP COLUMN IF EXISTS password;
    `;
    console.log("✅ Eski 'password' sütunu başarıyla kaldırıldı.");
  } catch (error) {
    console.error("❌ Eski 'password' sütunu kaldırılırken hata:", error);
    throw error;
  }
}

module.exports = { dropOldPasswordColumn };

// Eğer bu dosya doğrudan çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
  dropOldPasswordColumn()
    .then(() => {
      console.log("Migration tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration hatası:", error);
      process.exit(1);
    });
} 