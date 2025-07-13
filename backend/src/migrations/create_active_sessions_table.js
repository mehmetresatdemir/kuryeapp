const { sql } = require('../config/db-config');

async function up() {
  try {
    console.log('Creating active_sessions table...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS active_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_role VARCHAR(50) NOT NULL,
        session_token VARCHAR(255) NOT NULL UNIQUE,
        device_info TEXT,
        ip_address INET,
        socket_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        UNIQUE(user_id, user_role, session_token)
      )
    `;
    
    // Index ekle
    await sql`CREATE INDEX IF NOT EXISTS idx_active_sessions_user_role ON active_sessions(user_id, user_role)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(session_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_active_sessions_expires ON active_sessions(expires_at)`;
    
    console.log('active_sessions table created successfully');
    
  } catch (error) {
    console.error('Error creating active_sessions table:', error);
    throw error;
  }
}

async function down() {
  try {
    console.log('Dropping active_sessions table...');
    
    await sql`DROP TABLE IF EXISTS active_sessions CASCADE`;
    
    console.log('active_sessions table dropped successfully');
    
  } catch (error) {
    console.error('Error dropping active_sessions table:', error);
    throw error;
  }
}

module.exports = { up, down }; 