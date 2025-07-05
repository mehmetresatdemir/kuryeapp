const { sql } = require("../config/db-config");

async function addApprovalStatus() {
  try {
    console.log("🔄 'onay bekliyor' statusu database constraint'ine ekleniyor...");

    // Drop the existing constraint
    await sql`
      ALTER TABLE orders 
      DROP CONSTRAINT IF EXISTS neworders_status_check
    `;
    console.log("✅ Eski constraint kaldırıldı.");

    // Add the new constraint with 'onay bekliyor' included
    await sql`
      ALTER TABLE orders 
      ADD CONSTRAINT neworders_status_check 
      CHECK (status IN ('bekleniyor', 'kuryede', 'teslim edildi', 'iptal', 'onay bekliyor'))
    `;
    console.log("✅ Yeni constraint 'onay bekliyor' statusu ile eklendi.");

    console.log("✅ Approval status migration tamamlandı!");
  } catch (error) {
    console.error("❌ Approval status migration hatası:", error);
    throw error;
  }
}

module.exports = addApprovalStatus; 