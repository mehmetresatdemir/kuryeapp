const { sql } = require('../config/db-config');

async function verifyUser(email, password, role) {
  try {
    let userResult;
    let tableName;

    if (role === 'restaurant') {
      tableName = 'restaurants';
      userResult = await sql`
        SELECT id, name, email, password, yetkili_name, phone, latitude, longitude, created_at
        FROM restaurants
        WHERE email = ${email}
      `;
    } else if (role === 'courier') {
      tableName = 'couriers';
      userResult = await sql`
        SELECT id, name, email, password, latitude, longitude, created_at, package_limit, is_blocked
        FROM couriers
        WHERE email = ${email}
      `;
    } else {
      tableName = 'users';
      userResult = await sql`
        SELECT id, name, email, password, role, yetkili_name, phone, latitude, longitude, created_at, package_limit
        FROM users
        WHERE email = ${email}
      `;
    }

    if (userResult.length === 0) {
      return null;
    }

    const user = userResult[0];
    
    if (tableName === 'users' && !user.role) {
      return null;
    }

    // Check if courier is blocked
    if (role === 'courier' && user.is_blocked) {
      return null;
    }

    // Direct password comparison
    const isMatch = password === user.password;

    if (!isMatch) {
      return null;
    }

    const { password: _, ...userWithoutPassword } = user;
    return { ...userWithoutPassword, tableName };
    
  } catch (error) {
    console.error(`Error verifying user with email ${email} and role ${role}:`, error);
    throw error;
  }
}

module.exports = { verifyUser }; 