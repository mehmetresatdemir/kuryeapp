const { sql } = require("../config/db-config");

async function updateCourierCollections() {
  try {
    console.log("🔄 courier_collections tablosuna eksik kolonlar ekleniyor...");

    // Add missing columns to courier_collections table
    await sql`
      ALTER TABLE courier_collections 
      ADD COLUMN IF NOT EXISTS collection_date DATE DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS cash_collected DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS card_collected DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS gift_collected DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_collected DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS order_total DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS courier_fee DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `;
    console.log("✅ Eksik kolonlar eklendi.");

    // Add unique constraint on order_id if not exists
    try {
      await sql`
        ALTER TABLE courier_collections 
        ADD CONSTRAINT unique_courier_collections_order_id UNIQUE (order_id);
      `;
      console.log("✅ order_id unique constraint eklendi.");
    } catch (error) {
      if (error.code === '42P07') {
        console.log("ℹ️ order_id unique constraint zaten mevcut.");
      } else {
        throw error;
      }
    }

    // Create additional indexes
    await sql`
      CREATE INDEX IF NOT EXISTS idx_courier_collections_collection_date ON courier_collections(collection_date);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_courier_collections_total_collected ON courier_collections(total_collected);
    `;
    console.log("✅ Ek indeksler oluşturuldu.");

    console.log("✅ courier_collections güncelleme migration tamamlandı!");
  } catch (error) {
    console.error("❌ courier_collections güncelleme migration hatası:", error);
    throw error;
  }
}

// Run the migration
updateCourierCollections()
  .then(() => {
    console.log("✅ Migration başarıyla tamamlandı!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration hatası:", error);
    process.exit(1);
  });

module.exports = { updateCourierCollections }; 