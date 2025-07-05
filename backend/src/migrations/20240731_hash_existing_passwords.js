const { sql } = require('../config/db-config');
const bcrypt = require('bcryptjs');

async function hashExistingPasswords() {
  try {
    console.log("🔄 Mevcut kullanıcı şifreleri hashleniyor...");

    // Ensure test restaurant and courier exist with plain-text password for initial hashing
    // This is to guarantee quick login works for these test users
    await sql`
      INSERT INTO restaurants (id, name, email, password, yetkili_name, role) 
      VALUES (999999, 'Test Restaurant', 'test@restaurant.com', 'password123', 'Test Yetkili', 'restaurant')
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role;
    `;
    console.log("✅ Test restoran hesabı oluşturuldu veya güncellendi.");

    // Add yildiz@bufe.com to restaurants with a default password for hashing
    await sql`
      INSERT INTO restaurants (id, name, email, password, yetkili_name, role) 
      VALUES (999998, 'Yildiz Bufe', 'yildiz@bufe.com', 'password123', 'Yildiz Yetkilisi', 'restaurant')
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role;
    `;
    console.log("✅ 'yildiz@bufe.com' restoran hesabı oluşturuldu veya güncellendi.");

    // Add kaya@market.com to restaurants with a default password for hashing
    await sql`
      INSERT INTO restaurants (id, name, email, password, yetkili_name, role) 
      VALUES (999997, 'Kaya Market', 'kaya@market.com', 'password123', 'Kaya Yetkilisi', 'restaurant')
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role;
    `;
    console.log("✅ 'kaya@market.com' restoran hesabı oluşturuldu veya güncellendi.");

    await sql`
      INSERT INTO couriers (id, name, email, password, role) 
      VALUES (888888, 'Test Courier', 'testkurye@kuryeapp.com', 'password123', 'kurye')
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role;
    `;
    console.log("✅ Test kurye hesabı oluşturuldu veya güncellendi.");

    // Hash passwords for restaurants
    const restaurants = await sql`SELECT id, email, password FROM restaurants`;
    for (const restaurant of restaurants) {
      if (restaurant.password === 'password123') { // Only hash if it's the default plain text password
        const hashedPassword = await bcrypt.hash('password123', 10); // Hash 'password123'
        await sql`UPDATE restaurants SET password = ${hashedPassword} WHERE id = ${restaurant.id}`;
        console.log(`✅ Restoran #${restaurant.id} şifresi güncellendi.`);
      }
    }

    // Hash passwords for couriers
    const couriers = await sql`SELECT id, email, password FROM couriers`;
    for (const courier of couriers) {
      if (courier.password === 'password123') { // Only hash if it's the default plain text password
        const hashedPassword = await bcrypt.hash('password123', 10); // Hash 'password123'
        await sql`UPDATE couriers SET password = ${hashedPassword} WHERE id = ${courier.id}`;
        console.log(`✅ Kurye #${courier.id} şifresi güncellendi.`);
      }
    }

    console.log("✅ Mevcut kullanıcı şifreleri başarıyla hashlendi.");
  } catch (error) {
    console.error("❌ Mevcut şifreler hashlenirken hata:", error);
    throw error;
  }
}

module.exports = hashExistingPasswords; 