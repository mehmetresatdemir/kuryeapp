const { sql } = require('../config/db-config');

async function up() {
  try {
    console.log('Fixing session_token column length...');
    
    // session_token field'ını TEXT tipine çevir (unlimited length)
    await sql`
      ALTER TABLE active_sessions 
      ALTER COLUMN session_token TYPE TEXT
    `;
    
    console.log('session_token column length fixed successfully');
    
  } catch (error) {
    console.error('Error fixing session_token column length:', error);
    throw error;
  }
}

async function down() {
  try {
    console.log('Reverting session_token column length...');
    
    // Geri almak için VARCHAR(255) 'e döndür (ancak data loss olabilir)
    await sql`
      ALTER TABLE active_sessions 
      ALTER COLUMN session_token TYPE VARCHAR(255)
    `;
    
    console.log('session_token column length reverted successfully');
    
  } catch (error) {
    console.error('Error reverting session_token column length:', error);
    throw error;
  }
}

module.exports = { up, down }; 