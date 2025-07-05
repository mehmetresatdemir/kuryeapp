const { sql } = require("../config/db-config");

async function migrateUsersToRoles() {
  try {
    // 1. Create restaurants table
    await sql`
      CREATE TABLE IF NOT EXISTS restaurants (
        id BIGINT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        yetkili_name TEXT,
        phone TEXT,
        latitude NUMERIC,
        longitude NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    console.log("'restaurants' table created or already exists.");

    // 2. Create couriers table
    await sql`
      CREATE TABLE IF NOT EXISTS couriers (
        id BIGINT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        phone TEXT,
        latitude NUMERIC,
        longitude NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        package_limit INTEGER,
        last_seen TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    console.log("'couriers' table created or already exists.");

    // 3. Migrate data from users to restaurants
    const restaurantResult = await sql`SELECT COUNT(*) FROM restaurants`;
    const restaurantCount = parseInt(restaurantResult[0].count);
    if (restaurantCount === 0) {
      await sql`
        INSERT INTO restaurants (
          id, name, email, password, yetkili_name, phone, latitude, longitude, created_at
        )
        SELECT
          id, name, email, password, yetkili_name, phone, latitude, longitude, created_at
        FROM
          users
        WHERE
          role = 'firm';
      `;
      console.log("Data migrated from 'users' to 'restaurants'.");
    } else {
      console.log("'restaurants' table already contains data, skipping migration.");
    }

    // 4. Migrate data from users to couriers
    const courierResult = await sql`SELECT COUNT(*) FROM couriers`;
    const courierCount = parseInt(courierResult[0].count);
    if (courierCount === 0) {
      await sql`
        INSERT INTO couriers (
          id, name, email, password, latitude, longitude, created_at, package_limit
        )
        SELECT
          id, name, email, password, latitude, longitude, created_at, package_limit
        FROM
          users
        WHERE
          role = 'courier';
      `;
      console.log("Data migrated from 'users' to 'couriers'.");
    } else {
      console.log("'couriers' table already contains data, skipping migration.");
    }

    // 5. Drop the users table
    await sql`DROP TABLE IF EXISTS users;`;
    console.log("'users' table dropped.");

    console.log("User migration to roles completed successfully.");
  } catch (error) {
    console.error("Error during user migration to roles:", error);
    throw error;
  }
}

module.exports = migrateUsersToRoles; 