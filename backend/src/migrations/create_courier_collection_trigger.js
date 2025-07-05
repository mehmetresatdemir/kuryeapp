const { sql } = require("../config/db-config");

async function createCourierCollectionTrigger() {
  try {
    console.log("🔄 courier_collection trigger fonksiyonu oluşturuluyor...");

    // Create the trigger function
    await sql`
      CREATE OR REPLACE FUNCTION create_courier_collection()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only create collection record when order is delivered and has a courier
        IF NEW.status = 'teslim edildi' AND OLD.status != 'teslim edildi' AND NEW.kuryeid IS NOT NULL THEN
          INSERT INTO courier_collections (
            courier_id, restaurant_id, order_id, collection_date,
            cash_collected, card_collected, gift_collected, total_collected,
            order_total, courier_fee
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
            COALESCE(NEW.courier_price, 0)
          )
          ON CONFLICT (order_id) DO UPDATE SET
            cash_collected = EXCLUDED.cash_collected,
            card_collected = EXCLUDED.card_collected,
            gift_collected = EXCLUDED.gift_collected,
            total_collected = EXCLUDED.total_collected,
            order_total = EXCLUDED.order_total,
            courier_fee = EXCLUDED.courier_fee,
            updated_at = CURRENT_TIMESTAMP;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
    console.log("✅ create_courier_collection() fonksiyonu oluşturuldu.");

    // Create the trigger
    await sql`
      DROP TRIGGER IF EXISTS trigger_create_courier_collection ON orders;
    `;
    
    await sql`
      CREATE TRIGGER trigger_create_courier_collection
        AFTER UPDATE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION create_courier_collection();
    `;
    console.log("✅ trigger_create_courier_collection trigger'ı oluşturuldu.");

    console.log("✅ courier_collection trigger migration tamamlandı!");
  } catch (error) {
    console.error("❌ courier_collection trigger migration hatası:", error);
    throw error;
  }
}

// Run the migration
createCourierCollectionTrigger()
  .then(() => {
    console.log("✅ Migration başarıyla tamamlandı!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration hatası:", error);
    process.exit(1);
  });

module.exports = { createCourierCollectionTrigger }; 