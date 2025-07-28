const { sql } = require('../config/db-config');

async function createPushTokensTable() {
  try {
    console.log('🔧 Creating push_tokens table...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('courier', 'restaurant', 'admin')),
        expo_push_token TEXT NOT NULL,
        platform VARCHAR(10) DEFAULT 'ios' CHECK (platform IN ('ios', 'android')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, user_type)
      )
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id, user_type)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true
    `;
    
    console.log('✅ push_tokens table created successfully');
    
    // Test the table
    const testResult = await sql`SELECT COUNT(*) FROM push_tokens`;
    console.log(`📊 push_tokens table has ${testResult[0].count} records`);
    
  } catch (error) {
    console.error('❌ Error creating push_tokens table:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createPushTokensTable()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createPushTokensTable }; 