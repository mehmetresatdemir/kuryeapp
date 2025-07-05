const { sql } = require("../config/db-config");

async function updateForeignKeys() {
  try {
    console.log("🔄 Foreign key kısıtlamaları ve görünümler güncelleniyor...");

    // FK eklemeden önce bağımsız ID'lere sahip kayıtları temizle
    console.log("🔄 'orders' tablosundaki bağımsız firmaid ve kuryeid kayıtları siliniyor...");
    await sql`
      DELETE FROM orders
      WHERE firmaid IS NOT NULL AND firmaid NOT IN (SELECT id FROM restaurants);
    `;
    await sql`
      DELETE FROM orders
      WHERE kuryeid IS NOT NULL AND kuryeid NOT IN (SELECT id FROM couriers);
    `;
    console.log("✅ 'orders' tablosundaki bağımsız ID kayıtları silindi.");

    // FK eklemeden önce bağımsız restaurant_delivery_prices kayıtlarını temizle
    console.log("🔄 'restaurant_delivery_prices' tablosundaki bağımsız restaurant_id kayıtları siliniyor...");
    await sql`
      DELETE FROM restaurant_delivery_prices
      WHERE restaurant_id IS NOT NULL AND restaurant_id NOT IN (SELECT id FROM restaurants);
    `;
    console.log("✅ 'restaurant_delivery_prices' tablosundaki bağımsız restaurant_id kayıtları silindi.");

    // Add role column to restaurants table and set default
    await sql`
      ALTER TABLE restaurants
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'restaurant';
    `;
    await sql`
      UPDATE restaurants
      SET role = 'restaurant'
      WHERE role IS NULL;
    `;
    console.log("✅ 'restaurants' tablosuna role sütunu eklendi ve varsayılan rol atandı.");

    // Add role column to couriers table and set default
    await sql`
      ALTER TABLE couriers
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'kurye';
    `;
    await sql`
      UPDATE couriers
      SET role = 'kurye'
      WHERE role IS NULL;
    `;
    console.log("✅ 'couriers' tablosuna role sütunu eklendi ve varsayılan rol atandı.");

    // Remove unified users view for login
    // No longer needed as login logic will directly query restaurants/couriers based on role
    await sql`DROP VIEW IF EXISTS unified_users;`;
    console.log("'unified_users' görünümü bırakıldı (varsa).");

    // Görünümleri bırak
    await sql`DROP VIEW IF EXISTS restaurant_delivery_info;`;
    await sql`DROP VIEW IF EXISTS courier_collection_summary;`;
    await sql`DROP VIEW IF EXISTS restaurant_courier_summary;`;

    // orders tablosundaki mevcut FK'ları bırak
    await sql`
      ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS fk_orders_kuryeid_couriers,
      DROP CONSTRAINT IF EXISTS fk_orders_firmaid_restaurants;
    `;
    console.log("'orders' tablosundaki eski kullanıcı FK'ları bırakıldı (varsa).");

    // restaurant_delivery_prices tablosundaki mevcut FK'yı bırak
    await sql`
      ALTER TABLE restaurant_delivery_prices
      DROP CONSTRAINT IF EXISTS fk_restaurant_delivery_prices_restaurant_id_restaurants;
    `;
    console.log("'restaurant_delivery_prices' tablosundaki eski kullanıcı FK'sı bırakıldı (varsa).");

    // couriers tablosundaki mevcut FK'yı bırak
    await sql`
      ALTER TABLE couriers
      DROP CONSTRAINT IF EXISTS couriers_user_id_fkey;
    `;
    console.log("'couriers' tablosundaki eski kullanıcı FK'sı bırakıldı (varsa).");

    // orders tablosuna yeni FK'ları ekle
    await sql`
      ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS fk_orders_kuryeid_couriers,
      DROP CONSTRAINT IF EXISTS fk_orders_firmaid_restaurants;
    `;
    await sql`
      ALTER TABLE orders
      ADD CONSTRAINT fk_orders_kuryeid_couriers FOREIGN KEY (kuryeid) REFERENCES couriers(id) ON DELETE SET NULL,
      ADD CONSTRAINT fk_orders_firmaid_restaurants FOREIGN KEY (firmaid) REFERENCES restaurants(id) ON DELETE SET NULL;
    `;
    console.log("'orders' tablosuna yeni kurye ve restoran FK'ları eklendi.");

    // restaurant_delivery_prices tablosuna yeni FK'yı ekle
    await sql`
      ALTER TABLE restaurant_delivery_prices
      DROP CONSTRAINT IF EXISTS fk_restaurant_delivery_prices_restaurant_id_restaurants;
    `;
    await sql`
      ALTER TABLE restaurant_delivery_prices
      ADD CONSTRAINT fk_restaurant_delivery_prices_restaurant_id_restaurants FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE;
    `;
    console.log("'restaurant_delivery_prices' tablosuna yeni restoran FK'sı eklendi.");

    // couriers tablosuna yeni FK'yı ekle (Eğer couriers tablosu kendisi users tablosuna bağlıysa)
    // Kuryeler doğrudan user_id sütunu olmadan oluşturulduğu için bu kaldırıldı. Eğer varsa eklenmelidir.
    // await sql`ALTER TABLE couriers ADD CONSTRAINT fk_couriers_id_users FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE;`;

    console.log("✅ Foreign key kısıtlamaları ve görünümler başarıyla güncellendi.");
  } catch (error) {
    console.error("❌ Foreign key kısıtlamaları veya görünümler güncellenirken hata:", error);
    throw error;
  }
}

module.exports = updateForeignKeys; 