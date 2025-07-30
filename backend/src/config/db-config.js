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
  max: 20, // Maksimum bağlantı sayısı
  min: 2,  // Minimum bağlantı sayısı
  idleTimeoutMillis: 60000, // 1 dakika (30 saniyeden arttırıldı)
  connectionTimeoutMillis: 10000, // 10 saniye (2 saniyeden arttırıldı)
  acquireTimeoutMillis: 10000, // Pool'dan bağlantı alma timeout'u
  query_timeout: 30000, // SQL sorgu timeout'u
  statement_timeout: 30000, // Statement timeout
  // App schema ayarı
  application_name: 'kurye-backend',
  options: '--search_path=app',
  // Keep alive ayarları
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
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
  
  // Sadece kritik hatalar için uygulamayı kapat
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error('🔄 Kritik veritabanı hatası - 5 saniye sonra yeniden deneyecek...');
    setTimeout(() => {
      console.log('🔄 Veritabanı bağlantısı yeniden test ediliyor...');
      testConnection();
    }, 5000);
  } else {
    console.warn('⚠️ Geçici veritabanı hatası - devam ediliyor...');
  }
});

// Artık timestamp dönüşümü yapmıyoruz - veritabanından ne gelirse o

// Retry mechanism for database queries
const retryQuery = async (queryFunc, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await queryFunc();
    } catch (error) {
      lastError = error;
      
      // Retry sadece connection timeout'larda
      if (error.message?.includes('connection timeout') || 
          error.message?.includes('Connection terminated') ||
          error.code === 'ECONNRESET') {
        
        if (attempt < maxRetries) {
          console.warn(`⚠️ Veritabanı bağlantı hatası (${attempt}/${maxRetries}), ${attempt * 1000}ms sonra yeniden deneniyor...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          continue;
        }
      }
      
      // Retry edilemez hata veya max retry sayısına ulaşıldı
      throw error;
    }
  }
  
  throw lastError;
};

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
    
    return retryQuery(() => pool.query(query, params).then(result => {
      // Veritabanından gelen veriyi olduğu gibi döndür
      return result.rows;
    }));
  }
  
  // Direct query string usage
  return retryQuery(() => pool.query(strings, values).then(result => {
    // Veritabanından gelen veriyi olduğu gibi döndür
    return result.rows;
  }));
}

// Add sql.unsafe function for raw SQL strings
sql.unsafe = function(rawString) {
  return { __unsafe: rawString };
};

// Test connection function
const testConnection = async () => {
  try {
    await retryQuery(async () => {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
    });
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
    const result = await retryQuery(() => pool.query(text, params));
    return { success: true, data: result.rows };
  } catch (error) {
    console.error('Database query error:', error);
    return { success: false, error: error.message };
  }
};

// Health check function
const healthCheck = async () => {
  try {
    const result = await retryQuery(() => pool.query('SELECT 1 as health_check'));
    return { status: 'healthy', timestamp: new Date().toLocaleString('tr-TR'), result: result.rows };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date().toLocaleString('tr-TR') };
  }
};

module.exports = { pool, sql, testConnection, safeQuery, healthCheck }; 