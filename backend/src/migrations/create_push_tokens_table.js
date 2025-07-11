const { sql } = require('../config/db-config');

const createPushTokensTable = async () => {
    try {
        console.log('🔧 Push tokens tablosu oluşturuluyor...');
        
        // Push tokens tablosunu oluştur
        await sql`
            CREATE TABLE IF NOT EXISTS push_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('restaurant', 'courier')),
                token TEXT NOT NULL,
                platform VARCHAR(20) DEFAULT 'unknown',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                -- Her kullanıcı tipi için sadece bir aktif token olsun
                UNIQUE(user_id, user_type)
            )
        `;
        
        // Index'ler oluştur
        await sql`
            CREATE INDEX IF NOT EXISTS idx_push_tokens_user 
            ON push_tokens(user_id, user_type, is_active)
        `;
        
        await sql`
            CREATE INDEX IF NOT EXISTS idx_push_tokens_type_active 
            ON push_tokens(user_type, is_active)
        `;
        
        await sql`
            CREATE INDEX IF NOT EXISTS idx_push_tokens_token 
            ON push_tokens(token)
        `;
        
        console.log('✅ Push tokens tablosu başarıyla oluşturuldu');
        
        return true;
    } catch (error) {
        console.error('❌ Push tokens tablosu oluşturulurken hata:', error);
        throw error;
    }
};

module.exports = createPushTokensTable; 