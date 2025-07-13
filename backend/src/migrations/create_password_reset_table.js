const { sql } = require('../config/db-config');

const createPasswordResetTable = async () => {
    try {
        console.log('Creating password_reset_tokens table...');
        
        await sql`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                token VARCHAR(255) NOT NULL UNIQUE,
                user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('courier', 'restaurant')),
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        console.log('✅ password_reset_tokens table created successfully');
        
        // Index ekle
        await sql`
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens (email)
        `;
        
        await sql`
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens (token)
        `;
        
        console.log('✅ Indexes created successfully');
        
    } catch (error) {
        console.error('❌ Error creating password_reset_tokens table:', error);
        throw error;
    }
};

// Eğer bu dosya direkt çalıştırılırsa migration'ı çalıştır
if (require.main === module) {
    createPasswordResetTable()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = createPasswordResetTable; 