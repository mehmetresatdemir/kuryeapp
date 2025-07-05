const { sql } = require('../config/db-config');
const bcrypt = require('bcrypt');

async function updateAllPasswordsToAsd1223() {
  try {
    console.log("🔄 Tüm kullanıcı şifreleri 'asd1223' olarak güncelleniyor...");

    // Yeni şifreyi hashle
    const newPassword = 'asd1223';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log("🔐 Yeni şifre hashlendi:", newPassword);

    // Tüm restoranların şifrelerini güncelle
    const restaurants = await sql`SELECT id, email, name FROM restaurants`;
    console.log(`📍 ${restaurants.length} restoran bulundu...`);
    
    for (const restaurant of restaurants) {
      await sql`UPDATE restaurants SET password = ${hashedPassword} WHERE id = ${restaurant.id}`;
      console.log(`✅ Restoran güncellendi: ${restaurant.email} (${restaurant.name})`);
    }

    // Tüm kuryelerin şifrelerini güncelle  
    const couriers = await sql`SELECT id, email, name FROM couriers`;
    console.log(`🚴 ${couriers.length} kurye bulundu...`);
    
    for (const courier of couriers) {
      await sql`UPDATE couriers SET password = ${hashedPassword} WHERE id = ${courier.id}`;
      console.log(`✅ Kurye güncellendi: ${courier.email} (${courier.name})`);
    }

    console.log("🎉 Tüm kullanıcıların şifreleri başarıyla 'asd1223' olarak güncellendi!");
    console.log("📝 Yeni giriş bilgileri:");
    console.log("   Şifre: asd1223");
    console.log(`   Toplam güncellenen hesap: ${restaurants.length + couriers.length}`);
    
  } catch (error) {
    console.error("❌ Şifreler güncellenirken hata oluştu:", error);
    throw error;
  }
}

// Scripti doğrudan çalıştırılabilir yap
if (require.main === module) {
  updateAllPasswordsToAsd1223()
    .then(() => {
      console.log("✅ Script başarıyla tamamlandı!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Script hatası:", error);
      process.exit(1);
    });
}

module.exports = updateAllPasswordsToAsd1223; 