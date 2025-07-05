const { sql } = require("../config/db-config");

async function renameVehicleTypeToTotalOnlineMinutes() {
  try {
    console.log("🔄 vehicle_type kolonu total_online_minutes olarak değiştiriliyor...");

    // Check if vehicle_type column exists
    const columnExists = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'couriers' AND column_name = 'vehicle_type'
    `;

    if (columnExists.length > 0) {
      // Drop the column and recreate with new name and type
      await sql`
        ALTER TABLE couriers 
        DROP COLUMN IF EXISTS vehicle_type
      `;
      console.log("✅ vehicle_type kolonu kaldırıldı.");

      // Add new column for total online minutes
      await sql`
        ALTER TABLE couriers 
        ADD COLUMN IF NOT EXISTS total_online_minutes INTEGER DEFAULT 0
      `;
      console.log("✅ total_online_minutes kolonu eklendi.");
    } else {
      // If vehicle_type doesn't exist, just add the new column
      await sql`
        ALTER TABLE couriers 
        ADD COLUMN IF NOT EXISTS total_online_minutes INTEGER DEFAULT 0
      `;
      console.log("✅ total_online_minutes kolonu eklendi (vehicle_type mevcut değildi).");
    }

    // Add comment to the column
    await sql`
      COMMENT ON COLUMN couriers.total_online_minutes IS 'Kuryenin toplam çevrimiçi süresi (dakika cinsinden)'
    `;

    console.log("✅ vehicle_type -> total_online_minutes migration tamamlandı!");
  } catch (error) {
    console.error("❌ vehicle_type -> total_online_minutes migration hatası:", error);
    throw error;
  }
}

module.exports = { renameVehicleTypeToTotalOnlineMinutes }; 