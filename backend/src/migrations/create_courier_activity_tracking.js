const { sql } = require('../config/db-config');

async function createCourierActivityTracking() {
  try {
    console.log('🔄 Creating courier activity tracking tables...');
    
    // Kurye aktivite sessions tablosu
    await sql`
      CREATE TABLE IF NOT EXISTS courier_activity_sessions (
        id SERIAL PRIMARY KEY,
        courier_id INTEGER NOT NULL,
        session_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        session_end TIMESTAMP NULL,
        duration_minutes INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_courier_activity_courier FOREIGN KEY (courier_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    
    // Indexes for courier_activity_sessions
    await sql`CREATE INDEX IF NOT EXISTS idx_courier_sessions ON courier_activity_sessions (courier_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_session_date ON courier_activity_sessions (session_start)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_active_sessions ON courier_activity_sessions (courier_id, is_active)`;
    
    // Kurye günlük aktivite özet tablosu
    await sql`
      CREATE TABLE IF NOT EXISTS courier_daily_activity (
        id SERIAL PRIMARY KEY,
        courier_id INTEGER NOT NULL,
        activity_date DATE NOT NULL,
        total_minutes INTEGER DEFAULT 0,
        session_count INTEGER DEFAULT 0,
        first_login TIME NULL,
        last_logout TIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_courier_daily_courier FOREIGN KEY (courier_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT unique_courier_date UNIQUE (courier_id, activity_date)
      )
    `;
    
    // Indexes for courier_daily_activity
    await sql`CREATE INDEX IF NOT EXISTS idx_courier_daily ON courier_daily_activity (courier_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_date ON courier_daily_activity (activity_date)`;
    
    // Kurye haftalık aktivite özet tablosu
    await sql`
      CREATE TABLE IF NOT EXISTS courier_weekly_activity (
        id SERIAL PRIMARY KEY,
        courier_id INTEGER NOT NULL,
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        total_minutes INTEGER DEFAULT 0,
        total_days_active INTEGER DEFAULT 0,
        average_daily_minutes DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_courier_weekly_courier FOREIGN KEY (courier_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT unique_courier_week UNIQUE (courier_id, week_start)
      )
    `;
    
    // Indexes for courier_weekly_activity
    await sql`CREATE INDEX IF NOT EXISTS idx_courier_weekly ON courier_weekly_activity (courier_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_week_range ON courier_weekly_activity (week_start, week_end)`;
    
    // Trigger for updating updated_at timestamp
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `;
    
    // Apply trigger to tables
    await sql`
      CREATE TRIGGER update_courier_activity_sessions_updated_at 
      BEFORE UPDATE ON courier_activity_sessions 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `;
    
    await sql`
      CREATE TRIGGER update_courier_daily_activity_updated_at 
      BEFORE UPDATE ON courier_daily_activity 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `;
    
    await sql`
      CREATE TRIGGER update_courier_weekly_activity_updated_at 
      BEFORE UPDATE ON courier_weekly_activity 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `;
    
    console.log('✅ Courier activity tracking tables created successfully');
    
  } catch (error) {
    console.error('❌ Error creating courier activity tracking tables:', error);
    throw error;
  }
}

// Direkt çalıştırma
if (require.main === module) {
  createCourierActivityTracking()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createCourierActivityTracking }; 