const { sql } = require("../config/db-config");

async function fixCourierCollectionsAmount() {
  try {
    console.log("🔄 courier_collections amount kolonu düzeltiliyor...");

    // Make amount column nullable since it's not being used in the trigger
    await sql`
      ALTER TABLE courier_collections 
      ALTER COLUMN amount DROP NOT NULL;
    `;
    console.log("✅ amount kolonu nullable yapıldı.");

    // Update the trigger function to set amount value
    await sql`
      CREATE OR REPLACE FUNCTION create_courier_collection()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only create collection record when order is delivered
        IF NEW.status = 'teslim edildi' AND OLD.status != 'teslim edildi' THEN
          INSERT INTO courier_collections (
            courier_id, restaurant_id, order_id, collection_date,
            cash_collected, card_collected, gift_collected, total_collected,
            order_total, courier_fee, amount
          ) VALUES (
            NEW.kuryeid, 
            NEW.firmaid, 
            NEW.id, 
            CURRENT_DATE,
            COALESCE(NEW.nakit_tutari, 0),
            COALESCE(NEW.banka_tutari, 0),
            COALESCE(NEW.hediye_tutari, 0),
            (COALESCE(NEW.nakit_tutari, 0) + COALESCE(NEW.banka_tutari, 0) + COALESCE(NEW.hediye_tutari, 0)),
            (COALESCE(NEW.nakit_tutari, 0) + COALESCE(NEW.banka_tutari, 0) + COALESCE(NEW.hediye_tutari, 0) + COALESCE(NEW.courier_price, 0)),
            COALESCE(NEW.courier_price, 0),
            COALESCE(NEW.courier_price, 0)
          )
          ON CONFLICT (order_id) DO UPDATE SET
            cash_collected = EXCLUDED.cash_collected,
            card_collected = EXCLUDED.card_collected,
            gift_collected = EXCLUDED.gift_collected,
            total_collected = EXCLUDED.total_collected,
            order_total = EXCLUDED.order_total,
            courier_fee = EXCLUDED.courier_fee,
            amount = EXCLUDED.amount,
            updated_at = CURRENT_TIMESTAMP;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
    console.log("✅ create_courier_collection() fonksiyonu güncellendi.");

    console.log("✅ courier_collections amount düzeltme migration tamamlandı!");
  } catch (error) {
    console.error("❌ courier_collections amount düzeltme migration hatası:", error);
    throw error;
  }
}

// Run the migration
fixCourierCollectionsAmount()
  .then(() => {
    console.log("✅ Migration başarıyla tamamlandı!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration hatası:", error);
    process.exit(1);
  });

module.exports = { fixCourierCollectionsAmount }; 