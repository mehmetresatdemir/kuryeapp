require("dotenv").config();
const { Pool } = require("pg");

// PostgreSQL bağlantı konfigürasyonu
let connectionString = process.env.DATABASE_URL;

// Normal bağlantı string'i kullan
if (!connectionString) {
  connectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`;
}

// Pool oluştur
const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // App schema ayarı
  application_name: 'kurye-backend',
  options: '--search_path=app'
});

// Pool event handlers - sadece production'da hata loglarını göster
let connectionCount = 0;
pool.on('connect', async (client) => {
  try {
    // Her bağlantıda app schema'yı ayarla
    await client.query("SET search_path = app");
    connectionCount++;
    
    // Sadece ilk bağlantıda veya development modunda mesaj göster
    if (connectionCount === 1 || process.env.NODE_ENV !== 'production') {
      console.log('✅ Veritabanı bağlantı havuzu hazır (app schema ayarlandı)');
    }
  } catch (error) {
    console.error('❌ Veritabanı bağlantı hatası:', error);
  }
});

pool.on('error', (err) => {
  console.error('❌ Beklenmeyen veritabanı hatası:', err);
  process.exit(-1);
});

// Artık timestamp dönüşümü yapmıyoruz - veritabanından ne gelirse o

// SQL template literal function - Neon style
function sql(strings, ...values) {
  if (Array.isArray(strings) && strings.raw) {
    // Template literal usage
    let query = '';
    let paramIndex = 1;
    const params = [];
    
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      
      if (i < values.length) {
        const value = values[i];
        
        // Handle unsafe raw SQL strings
        if (value && typeof value === 'object' && value.__unsafe) {
          query += value.__unsafe;
        } else {
          query += `$${paramIndex}`;
          params.push(value);
          paramIndex++;
        }
      }
    }
    
    return pool.query(query, params).then(result => {
      // Veritabanından gelen veriyi olduğu gibi döndür
      return result.rows;
    });
  }
  
  // Direct query string usage
  return pool.query(strings, values).then(result => {
    // Veritabanından gelen veriyi olduğu gibi döndür
    return result.rows;
  });
}

// Add sql.unsafe function for raw SQL strings
sql.unsafe = function(rawString) {
  return { __unsafe: rawString };
};

// Test connection function
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

// Safe query wrapper
const safeQuery = async (text, params = []) => {
  try {
    const result = await pool.query(text, params);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error('Database query error:', error);
    return { success: false, error: error.message };
  }
};

// Health check function
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT 1 as health_check');
    return { status: 'healthy', timestamp: new Date().toLocaleString('tr-TR'), result: result.rows };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date().toLocaleString('tr-TR') };
  }
};

module.exports = { pool, sql, testConnection, safeQuery, healthCheck }; 