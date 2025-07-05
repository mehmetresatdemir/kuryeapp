const { sql } = require("../config/db-config");

async function createCourierCollections() {
  try {
    console.log("🔄 courier_collections tablosu oluşturuluyor...");

    // Create courier_collections table
    await sql`
      CREATE TABLE IF NOT EXISTS courier_collections (
        id SERIAL PRIMARY KEY,
        courier_id BIGINT NOT NULL,
        restaurant_id BIGINT NOT NULL,
        order_id BIGINT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        collection_type VARCHAR(50) DEFAULT 'delivery', -- 'delivery', 'tip', 'bonus'
        status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'collected', 'paid'
        created_at TIMESTAMPTZ DEFAULT NOW(),
        collected_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        notes TEXT,
        FOREIGN KEY (courier_id) REFERENCES couriers(id) ON DELETE CASCADE,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );
    `;
    console.log("✅ 'courier_collections' tablosu oluşturuldu.");

    // Create indexes for better performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_courier_collections_courier_id ON courier_collections(courier_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_courier_collections_restaurant_id ON courier_collections(restaurant_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_courier_collections_order_id ON courier_collections(order_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_courier_collections_status ON courier_collections(status);
    `;
    console.log("✅ courier_collections indeksleri oluşturuldu.");

    console.log("✅ courier_collections migration tamamlandı!");
  } catch (error) {
    console.error("❌ courier_collections migration hatası:", error);
    throw error;
  }
}

// Run the migration
createCourierCollections()
  .then(() => {
    console.log("✅ Migration başarıyla tamamlandı!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration hatası:", error);
    process.exit(1);
  });

module.exports = { createCourierCollections }; 